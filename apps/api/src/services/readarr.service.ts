import { ArrService } from './base/ArrService';
import { CacheService } from './cache.service';
import { ServiceConfig } from '../config/services.config';
import {
  ReadarrBook,
  ReadarrAuthor,
  AddReadarrBookRequest,
  UpdateReadarrBookRequest,
} from '../types/readarr.types';
import { UnifiedMediaItem, SearchResult } from '@dasharr/shared-types';

export class ReadarrService extends ArrService<
  ReadarrBook,
  AddReadarrBookRequest,
  UpdateReadarrBookRequest
> {
  constructor(config: ServiceConfig, cacheService: CacheService) {
    super(config, 'readarr', cacheService, 'v1');
  }

  protected getItemsEndpoint(): string {
    return '/book';
  }

  protected getItemEndpoint(id: number): string {
    return `/book/${id}`;
  }

  // Readarr-specific methods
  async getBooks(params?: any): Promise<ReadarrBook[]> {
    return this.getItems(params);
  }

  async getBookById(id: number): Promise<ReadarrBook> {
    return this.getItemById(id);
  }

  async addBook(book: AddReadarrBookRequest): Promise<ReadarrBook> {
    if ((book as AddReadarrBookRequest)?.author && (book as AddReadarrBookRequest)?.book) {
      return this.addBookWithAuthor(book as AddReadarrBookRequest);
    }
    return this.addItem(book);
  }

  async updateBook(
    id: number,
    updates: UpdateReadarrBookRequest
  ): Promise<ReadarrBook> {
    return this.updateItem(id, updates);
  }

  async deleteBook(id: number, deleteFiles: boolean = false): Promise<void> {
    await this.client.delete(`/book/${id}?deleteFiles=${deleteFiles}`);
    await this.cacheService.delByPattern(this.serviceName);
  }

  async searchBooks(query: string): Promise<SearchResult[]> {
    return this.search(query);
  }

  // Author management
  async getAuthors(): Promise<ReadarrAuthor[]> {
    return this.withCache(
      this.getCacheKey('authors'),
      300,
      () => this.client.get<ReadarrAuthor[]>('/author')
    );
  }

  async lookupAuthors(term: string): Promise<ReadarrAuthor[]> {
    if (!term || typeof term !== 'string') {
      return [];
    }
    return this.client.get<ReadarrAuthor[]>('/author/lookup', { term });
  }

  private async resolveAuthorId(
    author: AddReadarrBookRequest['author']
  ): Promise<number> {
    const existing = await this.client.get<ReadarrAuthor[]>('/author');
    const byForeignId = existing.find(
      (entry) =>
        author.foreignAuthorId &&
        entry.foreignAuthorId === author.foreignAuthorId
    );
    if (byForeignId?.id) {
      const needsUpdate =
        (author.qualityProfileId && byForeignId.qualityProfileId !== author.qualityProfileId) ||
        (author.metadataProfileId && byForeignId.metadataProfileId !== author.metadataProfileId) ||
        (author.rootFolderPath && byForeignId.path !== author.rootFolderPath);
      if (needsUpdate) {
        await this.client.put(`/author/${byForeignId.id}`, {
          ...byForeignId,
          qualityProfileId: author.qualityProfileId ?? byForeignId.qualityProfileId,
          metadataProfileId: author.metadataProfileId ?? byForeignId.metadataProfileId,
          rootFolderPath: author.rootFolderPath ?? byForeignId.path,
          monitored: author.monitored ?? byForeignId.monitored ?? true,
        });
      }
      return byForeignId.id;
    }

    const term = author.authorName?.trim() || author.authorNameLastFirst?.trim();
    if (!term) {
      throw new Error('Missing author name for Readarr lookup');
    }

    const lookup = await this.lookupAuthors(term);
    const match =
      lookup.find(
        (entry) =>
          author.foreignAuthorId &&
          entry.foreignAuthorId === author.foreignAuthorId
      ) || lookup[0];

    if (!match) {
      throw new Error('Failed to lookup author in Readarr');
    }

    const created = await this.client.post<ReadarrAuthor>('/author', {
      ...match,
      qualityProfileId: author.qualityProfileId,
      metadataProfileId: author.metadataProfileId,
      rootFolderPath: author.rootFolderPath,
      monitored: author.monitored ?? true,
      addOptions: {
        monitor: 'all',
        searchForMissingBooks: false,
      },
    });

    if (!created?.id) {
      throw new Error('Failed to create Readarr author');
    }

    return created.id;
  }

  private async addBookWithAuthor(
    request: AddReadarrBookRequest
  ): Promise<ReadarrBook> {
    const { author, book } = request;
    if (!book?.foreignBookId) {
      throw new Error('Missing foreign book id');
    }

    const authorId = await this.resolveAuthorId(author);
    const existing = await this.client.get<ReadarrBook[]>('/book', { authorId });
    const existingMatch = existing.find(
      (entry) => entry.foreignBookId === book.foreignBookId
    );
    if (existingMatch) {
      return existingMatch;
    }

    let lookupMatch: ReadarrBook | undefined;
    if (book.title) {
      const lookup = await this.client.get<ReadarrBook[]>('/book/lookup', {
        term: book.title,
      });
      lookupMatch = lookup.find(
        (entry) => entry.foreignBookId === book.foreignBookId
      );
    }

    if (!lookupMatch) {
      const lookupFallback = await this.client.get<ReadarrBook[]>('/book/lookup', {
        term: book.foreignBookId,
      });
      lookupMatch = lookupFallback.find(
        (entry) => entry.foreignBookId === book.foreignBookId
      );
    }

    if (!lookupMatch) {
      throw new Error('Failed to lookup book details in Readarr');
    }

    const { id, added, bookFileCount, statistics, ...payload } = lookupMatch as ReadarrBook & {
      added?: string;
      bookFileCount?: number;
      statistics?: ReadarrBook['statistics'];
    };

    return this.client.post<ReadarrBook>('/book', {
      ...payload,
      authorId,
      monitored: book.monitored ?? payload.monitored ?? true,
      anyEditionOk: book.anyEditionOk ?? payload.anyEditionOk ?? true,
      addOptions: payload.addOptions || {
        searchForNewBook: false,
      },
    });
  }

  async getAuthorById(id: number): Promise<ReadarrAuthor> {
    return this.withCache(
      this.getCacheKey('author', id),
      300,
      () => this.client.get<ReadarrAuthor>(`/author/${id}`)
    );
  }

  async deleteAuthor(id: number, deleteFiles: boolean = false): Promise<void> {
    await this.client.delete(`/author/${id}?deleteFiles=${deleteFiles}`);
    await this.cacheService.delByPattern(this.serviceName);
  }

  async triggerBookSearch(
    bookId: number,
    interactive: boolean = false
  ): Promise<void> {
    const commandNames = interactive
      ? ['BookSearch']
      : ['BookSearchAutomatic', 'BookSearch'];
    let lastError: unknown;

    for (const name of commandNames) {
      try {
        await this.executeCommand({
          name,
          bookIds: [bookId],
          bookId,
        });
        return;
      } catch (error) {
        lastError = error;
      }
    }

    throw lastError;
  }

  async getRootFolders(): Promise<any[]> {
    return this.client.get('/rootfolder');
  }

  async getMetadataProfiles(): Promise<any[]> {
    return this.withCache(
      this.getCacheKey('metadataprofiles'),
      300,
      () => this.client.get('/metadataprofile')
    );
  }

  // Transform Readarr book to unified format
  transformToUnified(book: ReadarrBook): UnifiedMediaItem {
    const cover = book.images?.find((img) => img.coverType === 'cover');
    const poster = book.images?.find((img) => img.coverType === 'poster');

    let status: UnifiedMediaItem['status'] = 'missing';
    if (book.grabbed) {
      status = 'available';
    } else if (book.monitored) {
      status = 'wanted';
    }

    return {
      id: `readarr:${book.id}`,
      type: 'book',
      title: book.title,
      overview: book.overview,
      posterUrl: cover?.remoteUrl || cover?.url || poster?.remoteUrl || poster?.url,
      status,
      qualityProfile: book.qualityProfileId.toString(),
      monitored: book.monitored,
      metadata: {
        author: book.authorTitle,
        pages: book.pageCount,
      },
      source: {
        service: 'readarr',
        id: book.id,
      },
    };
  }
}

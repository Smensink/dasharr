/**
 * Debug script to understand description matching
 */

function extractNgrams(words: string[], n: number): Set<string> {
  const ngrams = new Set<string>();
  for (let i = 0; i <= words.length - n; i++) {
    const ngram = words.slice(i, i + n).join(' ');
    ngrams.add(ngram);
  }
  return ngrams;
}

function matchDescriptions(desc1: string, desc2: string): number {
  if (!desc1 || !desc2) return 0;

  const clean1 = desc1.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ');
  const clean2 = desc2.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ');

  console.log('Clean1 length:', clean1.length);
  console.log('Clean2 length:', clean2.length);

  // Common stop words to filter out
  const stopWords = new Set(['the', 'and', 'for', 'with', 'you', 'your', 'this', 'that', 'from', 'are', 'was', 'were', 'been', 'have', 'has', 'had', 'will', 'can', 'may']);

  // Extract meaningful words (length > 3, not stop words)
  const words1 = clean1.split(/\s+/).filter(w => w.length > 3 && !stopWords.has(w));
  const words2 = clean2.split(/\s+/).filter(w => w.length > 3 && !stopWords.has(w));

  console.log('Words1 count:', words1.length);
  console.log('Words2 count:', words2.length);
  console.log('Words1 sample:', words1.slice(0, 20));
  console.log('Words2 sample:', words2.slice(0, 20));

  if (words1.length === 0 || words2.length === 0) return 0;

  // 1. Word-level Jaccard similarity
  const wordSet1 = new Set(words1);
  const wordSet2 = new Set(words2);
  const wordIntersection = new Set([...wordSet1].filter(w => wordSet2.has(w)));
  const wordUnion = new Set([...wordSet1, ...wordSet2]);
  const jaccardScore = wordIntersection.size / wordUnion.size;

  console.log('Unique words1:', wordSet1.size);
  console.log('Unique words2:', wordSet2.size);
  console.log('Intersection:', wordIntersection.size);
  console.log('Union:', wordUnion.size);
  console.log('Jaccard score:', jaccardScore);

  // Also calculate containment score (how much of the smaller set is in the larger)
  const smallerSet = wordSet1.size < wordSet2.size ? wordSet1 : wordSet2;
  const containmentScore = wordIntersection.size / smallerSet.size;

  console.log('Smaller set size:', smallerSet.size);
  console.log('Containment score:', containmentScore);

  // 2. Bigram similarity (2-word phrases)
  const bigrams1 = extractNgrams(words1, 2);
  const bigrams2 = extractNgrams(words2, 2);
  const bigramIntersection = new Set([...bigrams1].filter(b => bigrams2.has(b)));
  const bigramScore = bigrams1.size > 0 && bigrams2.size > 0
    ? bigramIntersection.size / Math.max(bigrams1.size, bigrams2.size)
    : 0;

  console.log('Bigrams1:', bigrams1.size);
  console.log('Bigrams2:', bigrams2.size);
  console.log('Bigram intersection:', bigramIntersection.size);
  console.log('Bigram score:', bigramScore);

  // 3. Trigram similarity (3-word phrases)
  const trigrams1 = extractNgrams(words1, 3);
  const trigrams2 = extractNgrams(words2, 3);
  const trigramIntersection = new Set([...trigrams1].filter(t => trigrams2.has(t)));
  const trigramScore = trigrams1.size > 0 && trigrams2.size > 0
    ? trigramIntersection.size / Math.max(trigrams1.size, trigrams2.size)
    : 0;

  console.log('Trigrams1:', trigrams1.size);
  console.log('Trigrams2:', trigrams2.size);
  console.log('Trigram intersection:', trigramIntersection.size);
  console.log('Trigram score:', trigramScore);

  // Use the better of Jaccard (strict) or containment (lenient for subset matches)
  const wordScore = Math.max(jaccardScore, containmentScore);

  // Weighted combination: trigrams are most important, then bigrams, then words
  const combinedScore = (trigramScore * 0.5) + (bigramScore * 0.3) + (wordScore * 0.2);

  console.log('\nFinal scores:');
  console.log('Word score:', wordScore);
  console.log('Combined score:', combinedScore);

  return combinedScore;
}

// Sample descriptions based on logs
const steamDesc = `THE NORSE SAGA CONTINUES From Santa Monica Studio and brought to PC in partnership with Jetpack Interactive comes God of War Ragnarök, an epic and heartfelt journey that follows Kratos and Atreus as they struggle with holding on and letting go. The sequel to the critically acclaimed God of War (2018), God of War Ragnarök picks up with Fimbulwinter well underway. Kratos and Atreus must journey to each of the Nine Realms in search of answers as Odin's forces in Asgard prepare for a prophesied battle that will end the world. Along the way, they will explore stunning, mythical landscapes, and face fearsome enemies in the form of Norse gods and monsters. As the threat of Ragnarök grows ever closer, Kratos and Atreus must choose between the safety of their family and the safety of the realms.`;

const fitgirlDesc = `The sequel to the critically acclaimed God of War (2018), God of War Ragnarök picks up with Fimbulwinter well underway. Kratos and Atreus must journey to each of the Nine Realms in search of answers as Odin's forces in Asgard prepare for a prophesied battle that will end the world. Along the way, they will explore stunning, mythical landscapes, and face fearsome enemies in the form of Norse gods and monsters. As the threat of Ragnarök grows ever closer, Kratos and Atreus must choose between the safety of their family and the safety of the realms.`;

console.log('=== Comparing descriptions ===\n');
console.log('Steam length:', steamDesc.length);
console.log('FitGirl length:', fitgirlDesc.length);
console.log('');

matchDescriptions(steamDesc, fitgirlDesc);

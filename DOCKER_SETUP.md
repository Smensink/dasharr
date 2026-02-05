# DashArr Docker Setup Guide

This guide will help you deploy DashArr using Docker to manage your *arr media server stack.

## Prerequisites

- Docker Desktop installed and running
- Your *arr services (Radarr, Sonarr, etc.) already running and accessible
- API keys for each service you want to connect

## Quick Start

### 1. Configuration

Create a `.env` file in the `docker` directory with your service configurations:

```bash
cd docker
cp ../.env.example .env
```

Edit the `.env` file with your settings:

```bash
# Application Configuration
NODE_ENV=production
PORT=3000

# Radarr Configuration
RADARR_ENABLED=true
RADARR_URL=http://host.docker.internal:7878
RADARR_API_KEY=your_radarr_api_key_here

# Sonarr Configuration
SONARR_ENABLED=true
SONARR_URL=http://host.docker.internal:8989
SONARR_API_KEY=your_sonarr_api_key_here

# Readarr Configuration
READARR_ENABLED=true
READARR_URL=http://host.docker.internal:8787
READARR_API_KEY=your_readarr_api_key_here

# Prowlarr Configuration
PROWLARR_ENABLED=true
PROWLARR_URL=http://host.docker.internal:9696
PROWLARR_API_KEY=your_prowlarr_api_key_here

# qBittorrent Configuration
QBITTORRENT_ENABLED=true
QBITTORRENT_URL=http://host.docker.internal:8085
QBITTORRENT_USERNAME=admin
QBITTORRENT_PASSWORD=your_password_here
```

### 2. Start the Container

```bash
docker-compose up -d --build
```

### 3. Access DashArr

Open your browser to: **http://localhost:3000**

## Important Notes

### Using `host.docker.internal`

When running DashArr in Docker and your *arr services on the host machine (not in containers), use `host.docker.internal` instead of `localhost`:

```bash
# ✅ Correct for host services
RADARR_URL=http://host.docker.internal:7878

# ❌ Wrong - won't work from inside container
RADARR_URL=http://localhost:7878
```

### Docker Network Setup

If your *arr services are also running in Docker containers:

1. **Same Docker network**: Use the container names directly
   ```bash
   RADARR_URL=http://radarr:7878
   SONARR_URL=http://sonarr:8989
   ```

2. **Different Docker networks**: Create a shared network
   ```bash
   docker network create arr-network
   ```
   Then add all containers to this network in their docker-compose files.

## Getting API Keys

### Radarr, Sonarr, Readarr
1. Open the service web interface
2. Go to **Settings** → **General**
3. Look for **API Key** section
4. Copy the API key

### Prowlarr
1. Open Prowlarr web interface
2. Go to **Settings** → **General**
3. Look for **API Key** under Security section
4. Copy the API key

### qBittorrent
Use your qBittorrent Web UI credentials:
- Default username is usually `admin`
- Password is what you set during qBittorrent setup

## Container Management

### View Logs
```bash
docker-compose logs -f
```

### Restart Container
```bash
docker-compose restart
```

### Stop Container
```bash
docker-compose down
```

### Rebuild After Code Changes
```bash
docker-compose down
docker-compose up -d --build
```

### Check Container Status
```bash
docker-compose ps
```

## Troubleshooting

### Services Showing as Disconnected

1. **Check the logs**:
   ```bash
   docker-compose logs --tail=50
   ```

2. **Verify URLs are accessible from container**:
   ```bash
   docker exec dasharr wget -q -O- http://host.docker.internal:7878/api/v3/system/status
   ```

3. **Verify API keys are correct**:
   - Check for typos in the `.env` file
   - Regenerate API keys if needed

4. **Check environment variables inside container**:
   ```bash
   docker exec dasharr env | grep RADARR
   ```

### Port Already in Use

If port 3000 is already taken:

1. **Option 1**: Stop the conflicting service
2. **Option 2**: Change DashArr's port in `docker-compose.yml`:
   ```yaml
   ports:
     - "3001:3000"  # Use port 3001 instead
   ```

### Build Failures

If the Docker build fails:

```bash
# Clean build with no cache
docker-compose down
docker-compose build --no-cache
docker-compose up -d
```

### "Unhealthy" Warnings

Services may show as connected but with health warnings. This is normal and means:
- The API connection is working
- The service has internal warnings (like missing indexers, removed media from TMDb, etc.)
- Check the service's own web interface to resolve these warnings

## Performance Tips

### Cache Configuration

Adjust cache TTL values in `.env` for better performance:

```bash
# Cache Configuration (in seconds)
CACHE_TTL_DEFAULT=300    # 5 minutes
CACHE_TTL_QUEUE=10       # 10 seconds
CACHE_TTL_HEALTH=60      # 1 minute
```

- Increase `CACHE_TTL_DEFAULT` if your library doesn't change often
- Decrease `CACHE_TTL_QUEUE` for more real-time download updates
- Increase values to reduce API load on your services

## Security Considerations

1. **API Keys**: Keep your `.env` file secure and never commit it to version control
2. **Network Access**: Consider using a reverse proxy (nginx, Traefik) with authentication
3. **HTTPS**: Use a reverse proxy for SSL/TLS encryption in production
4. **Firewall**: Ensure port 3000 is only accessible from trusted networks

## Advanced Configuration

### Custom Port

Edit `docker-compose.yml`:
```yaml
ports:
  - "8080:3000"  # Access on port 8080
```

### Resource Limits

Add resource limits to `docker-compose.yml`:
```yaml
services:
  dasharr:
    # ... existing config ...
    deploy:
      resources:
        limits:
          cpus: '0.5'
          memory: 512M
        reservations:
          memory: 256M
```

### Persistent Data (Future)

When database support is added, mount volumes for data persistence:
```yaml
volumes:
  - ./data:/app/data
```

## Health Check

The container includes a health check that runs every 30 seconds:

```bash
# Check container health
docker inspect dasharr | grep -A 5 Health
```

Healthy output means the API is responding correctly.

## Next Steps

Once DashArr is running:

1. **Verify all services are connected** on the dashboard
2. **Browse your media** across all services
3. **Monitor downloads** in the unified queue view
4. **Configure notifications** (coming soon)
5. **Set up calendar view** (coming soon)

## Support

If you encounter issues:
1. Check the logs: `docker-compose logs -f`
2. Verify your configuration in `.env`
3. Test API connectivity manually
4. Check the main README for additional troubleshooting

Happy streaming! 🎬📺📚

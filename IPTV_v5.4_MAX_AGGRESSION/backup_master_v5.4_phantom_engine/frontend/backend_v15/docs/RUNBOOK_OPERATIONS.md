# 📘 APE v15 ULTIMATE - Operational Runbook

> **Version**: 15.0.1-ULTIMATE  
> **Last Updated**: 2026-01-03  
> **Audience**: DevOps / SRE / Support Teams

---

## 📋 Table of Contents

1. [Service Management](#1-service-management)
2. [Health Monitoring](#2-health-monitoring)
3. [Troubleshooting Guide](#3-troubleshooting-guide)
4. [Redis Operations](#4-redis-operations)
5. [Log Analysis](#5-log-analysis)
6. [Performance Tuning](#6-performance-tuning)
7. [Emergency Procedures](#7-emergency-procedures)

---

## 1. Service Management

### 1.1 Start Services (Docker Compose)

```bash
cd /opt/ape_v15_ultimate

# Start all services
docker compose up -d

# Verify containers are running
docker compose ps
```

**Expected output:**

```
NAME                STATUS              PORTS
ape_v15_backend     Up (healthy)        0.0.0.0:8080->8080/tcp
ape_v15_redis       Up (healthy)        0.0.0.0:6379->6379/tcp
```

### 1.2 Stop Services

```bash
# Graceful stop
docker compose stop

# Stop and remove containers
docker compose down

# Stop, remove, and delete volumes (CAUTION: data loss)
docker compose down -v
```

### 1.3 Restart Services

```bash
# Restart all
docker compose restart

# Restart only backend
docker compose restart ape-backend
```

### 1.4 View Logs

```bash
# Live logs (all services)
docker compose logs -f

# Backend logs only (last 100 lines)
docker compose logs -f --tail=100 ape-backend

# Redis logs
docker compose logs -f redis
```

---

## 2. Health Monitoring

### 2.1 Health Check Endpoint

```bash
curl http://localhost:8080/health
```

**Healthy Response:**

```json
{
  "status": "healthy",
  "version": "15.0.1-ULTIMATE",
  "timestamp": "2026-01-03T23:45:00.000Z",
  "redis": "connected",
  "profiles_loaded": 6,
  "active_sessions": 42
}
```

**Unhealthy Indicators:**

- `"status": "unhealthy"`
- `"redis": "disconnected"`
- HTTP 500 or connection refused

### 2.2 Metrics Endpoint

```bash
# Human-readable metrics
curl http://localhost:8080/api/metrics

# Prometheus format (for Grafana)
curl http://localhost:8080/metrics/prometheus
```

### 2.3 Active Sessions

```bash
curl http://localhost:8080/sessions | jq
```

### 2.4 Container Health

```bash
# Check Docker health status
docker inspect --format='{{.State.Health.Status}}' ape_v15_backend
# Expected: healthy

docker inspect --format='{{.State.Health.Status}}' ape_v15_redis
# Expected: healthy
```

---

## 3. Troubleshooting Guide

### 3.1 Backend Not Starting

**Symptoms:** Container exits immediately or health check fails

**Diagnosis:**

```bash
docker compose logs ape-backend --tail=50
```

**Common Causes:**

| Error | Solution |
|-------|----------|
| `Redis connection failed` | Ensure Redis is running: `docker compose up -d redis` |
| `Port 8080 already in use` | Kill process: `lsof -i :8080` then `kill -9 <PID>` |
| `Module not found` | Rebuild image: `docker compose build --no-cache` |
| `Permission denied` | Check file permissions: `chmod -R 755 /opt/ape_v15_ultimate` |

### 3.2 Redis Connection Issues

**Symptoms:** `redis: disconnected` in health check

**Diagnosis:**

```bash
# Check Redis container
docker compose ps redis

# Test Redis directly
docker exec ape_v15_redis redis-cli ping
# Expected: PONG

# Check Redis logs
docker compose logs redis
```

**Solution:**

```bash
# Restart Redis
docker compose restart redis

# If persistent, recreate
docker compose down
docker compose up -d
```

### 3.3 High Latency

**Symptoms:** Latency > 100ms in metrics

**Diagnosis:**

```bash
# Check system resources
docker stats

# Check network
docker exec ape_v15_backend ping -c 5 redis
```

**Solutions:**

1. Increase Redis memory: Edit `docker-compose.yml`, change `--maxmemory`
2. Reduce telemetry frequency: Set `TELEMETRY_INTERVAL_MS=200` in `.env`
3. Scale horizontally: Add more backend containers

### 3.4 Frequent Failovers

**Symptoms:** Failover count increasing rapidly

**Diagnosis:**

```bash
curl http://localhost:8080/api/metrics | jq '.failovers_last_hour'
```

**Solutions:**

1. Check upstream CDN health
2. Increase buffer thresholds in `ape_profiles_v15.json`
3. Extend hysteresis window: Set `HYSTERESIS_WINDOW_S=90` in `.env`

---

## 4. Redis Operations

### 4.1 Check Memory Usage

```bash
docker exec ape_v15_redis redis-cli INFO memory | grep used_memory_human
```

### 4.2 View Cached Keys

```bash
# List all APE keys
docker exec ape_v15_redis redis-cli KEYS "ape:*"

# Count keys
docker exec ape_v15_redis redis-cli DBSIZE
```

### 4.3 Clear Cache (CAUTION)

```bash
# Clear all APE keys (safe)
docker exec ape_v15_redis redis-cli KEYS "ape:*" | xargs docker exec -i ape_v15_redis redis-cli DEL

# Flush entire database (DANGEROUS)
docker exec ape_v15_redis redis-cli FLUSHDB
```

### 4.4 Backup Redis Data

```bash
# Trigger RDB snapshot
docker exec ape_v15_redis redis-cli BGSAVE

# Copy dump file
docker cp ape_v15_redis:/data/dump.rdb ./backup/redis_backup_$(date +%Y%m%d).rdb
```

### 4.5 Restore Redis Data

```bash
# Stop Redis
docker compose stop redis

# Copy backup file
docker cp ./backup/redis_backup.rdb ape_v15_redis:/data/dump.rdb

# Start Redis
docker compose start redis
```

---

## 5. Log Analysis

### 5.1 Log Locations

| Log | Location |
|-----|----------|
| Backend (Docker) | `docker compose logs ape-backend` |
| Backend (File) | `/opt/ape_v15_ultimate/logs/ape_v15.log` |
| Redis | `docker compose logs redis` |

### 5.2 Key Log Patterns

```bash
# Failover events
docker compose logs ape-backend | grep "FAILOVER"

# Failback events
docker compose logs ape-backend | grep "FAILBACK"

# Errors
docker compose logs ape-backend | grep "ERROR"

# Session creation
docker compose logs ape-backend | grep "Session created"
```

### 5.3 Log Rotation

Add to `docker-compose.yml`:

```yaml
services:
  ape-backend:
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "5"
```

---

## 6. Performance Tuning

### 6.1 Key Parameters (.env)

| Parameter | Default | Description | Range |
|-----------|---------|-------------|-------|
| `TELEMETRY_INTERVAL_MS` | 100 | Telemetry capture rate | 50-500 |
| `SNAPSHOT_INTERVAL_S` | 10 | Macro snapshot interval | 5-30 |
| `HYSTERESIS_WINDOW_S` | 60 | Failback delay | 30-120 |
| `REDIS_TTL_S` | 3600 | Cache expiration | 300-7200 |

### 6.2 Buffer Adjustments

Edit `config/ape_profiles_v15.json`:

```json
{
  "profiles": [
    {
      "id": "P2",
      "buffer_config": {
        "LIVE_SPORTS": {
          "min_ms": 3000,  // Increase for stability
          "max_ms": 5000,
          "target_ms": 4000
        }
      }
    }
  ]
}
```

### 6.3 Redis Optimization

```bash
# Increase max memory (edit docker-compose.yml)
command: redis-server --maxmemory 1gb --maxmemory-policy allkeys-lru
```

---

## 7. Emergency Procedures

### 7.1 Complete Service Failure

```bash
# 1. Stop all containers
docker compose down

# 2. Check disk space
df -h

# 3. Clean Docker (if disk full)
docker system prune -f

# 4. Restart services
docker compose up -d

# 5. Verify health
curl http://localhost:8080/health
```

### 7.2 Rollback to Previous Version

```bash
# 1. Stop services
docker compose down

# 2. Checkout previous version
git checkout v15.0.0

# 3. Rebuild and restart
docker compose build --no-cache
docker compose up -d
```

### 7.3 Database Corruption

```bash
# 1. Stop Redis
docker compose stop redis

# 2. Remove corrupted data
docker volume rm backend-ape-v15_redis_data

# 3. Restart (fresh database)
docker compose up -d redis
docker compose restart ape-backend
```

### 7.4 Emergency Contact

| Role | Contact |
|------|---------|
| On-Call Engineer | <escalation@your-company.com> |
| DevOps Lead | <devops@your-company.com> |

---

## 📝 Quick Reference

| Action | Command |
|--------|---------|
| Start | `docker compose up -d` |
| Stop | `docker compose down` |
| Logs | `docker compose logs -f` |
| Health | `curl localhost:8080/health` |
| Metrics | `curl localhost:8080/api/metrics` |
| Sessions | `curl localhost:8080/sessions` |
| Restart | `docker compose restart` |

---

**Document Version:** 1.0.0  
**Last Review:** 2026-01-03

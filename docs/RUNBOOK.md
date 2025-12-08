# TextMesh Operations Runbook

## Quick Reference

### Service Health Check
```bash
# Check all services
kubectl get pods -n textmesh-prod

# Check specific service
kubectl logs -f deployment/feed-service -n textmesh-prod

# Check service metrics
curl http://feed-service:3004/health
```

### Common Commands
```bash
# Restart a service
kubectl rollout restart deployment/feed-service -n textmesh-prod

# Scale a service
kubectl scale deployment/feed-service --replicas=5 -n textmesh-prod

# View logs
kubectl logs -f deployment/api-gateway -n textmesh-prod --tail=100

# Get service events
kubectl describe deployment/post-service -n textmesh-prod
```

---

## Incident Playbooks

### High Error Rate

**Symptoms**
- Error rate > 1%
- Increased 5xx responses
- User complaints

**Diagnosis**
```bash
# Check error logs
kubectl logs deployment/api-gateway -n textmesh-prod | grep ERROR | tail -50

# Check error distribution by endpoint
curl -s 'http://prometheus:9090/api/v1/query?query=sum(rate(http_requests_total{status=~"5.."}[5m])) by (endpoint)'

# Check recent deployments
kubectl rollout history deployment/api-gateway -n textmesh-prod
```

**Resolution**
1. If recent deployment, rollback:
   ```bash
   kubectl rollout undo deployment/api-gateway -n textmesh-prod
   ```

2. If database related, check connections:
   ```bash
   psql -c "SELECT * FROM pg_stat_activity WHERE state = 'active';"
   ```

3. If external service, enable circuit breaker:
   ```bash
   kubectl set env deployment/api-gateway ENABLE_CIRCUIT_BREAKER=true
   ```

---

### High Latency

**Symptoms**
- P95 latency > 1s
- Slow feed loading
- Timeout errors

**Diagnosis**
```bash
# Check slowest endpoints
curl -s 'http://prometheus:9090/api/v1/query?query=histogram_quantile(0.95,sum(rate(http_request_duration_seconds_bucket[5m])) by (endpoint,le))'

# Check database slow queries
psql -c "SELECT * FROM pg_stat_statements ORDER BY mean_time DESC LIMIT 10;"

# Check cache hit rate
redis-cli info stats | grep hit
```

**Resolution**
1. If cache miss rate high:
   ```bash
   # Pre-warm cache
   kubectl exec -it deployment/feed-service -- npm run cache:warm
   ```

2. If database slow:
   ```bash
   # Kill long-running queries
   psql -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE duration > interval '30 seconds' AND state = 'active';"
   ```

3. If service overloaded:
   ```bash
   kubectl scale deployment/feed-service --replicas=10
   ```

---

### Database Issues

**High Connection Count**
```bash
# Check connection count
psql -c "SELECT count(*) FROM pg_stat_activity;"

# Check connections by application
psql -c "SELECT application_name, count(*) FROM pg_stat_activity GROUP BY 1;"

# If PgBouncer, check pool status
psql -p 6432 pgbouncer -c "SHOW POOLS;"

# Terminate idle connections
psql -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE state = 'idle' AND query_start < NOW() - INTERVAL '10 minutes';"
```

**Replication Lag**
```bash
# Check replication status
psql -c "SELECT client_addr, state, sent_lsn, write_lsn, flush_lsn, replay_lsn FROM pg_stat_replication;"

# Check lag in bytes
psql -c "SELECT pg_wal_lsn_diff(sent_lsn, replay_lsn) as lag_bytes FROM pg_stat_replication;"

# If lag > 100MB, investigate:
# 1. Check replica disk I/O
# 2. Check network between primary and replica
# 3. Consider adding more replicas
```

**Failover**
```bash
# Promote replica to primary
pg_ctl promote -D /var/lib/postgresql/data

# Update application connection strings
kubectl set env deployment/api-gateway DATABASE_URL=postgresql://replica-host:5432/textmesh

# Verify application connectivity
kubectl logs deployment/api-gateway | grep database
```

---

### Redis Issues

**Memory Pressure**
```bash
# Check memory usage
redis-cli info memory | grep used_memory_human

# Check key distribution
redis-cli --bigkeys

# Evict keys if needed
redis-cli config set maxmemory-policy allkeys-lru

# Clear specific cache namespace
redis-cli --scan --pattern "feed:*" | xargs redis-cli del
```

**Cluster Issues**
```bash
# Check cluster health
redis-cli cluster info

# Check node status
redis-cli cluster nodes

# If node down, trigger failover
redis-cli cluster failover

# Rebalance slots
redis-cli --cluster rebalance <cluster-host>:6379
```

---

### CDN Issues

**High Cache Miss Rate**
```bash
# Check cache headers
curl -I https://textmesh.com/static/app.js

# Purge cache
curl -X POST "https://api.cloudflare.com/client/v4/zones/{zone_id}/purge_cache" \
  -H "Authorization: Bearer $CF_TOKEN" \
  -H "Content-Type: application/json" \
  --data '{"purge_everything":true}'

# Warm cache
for url in $(cat urls.txt); do curl -s "$url" > /dev/null; done
```

**Origin Errors**
```bash
# Check origin health
curl -I http://origin.textmesh.com/health

# Enable maintenance mode
curl -X POST "https://api.cloudflare.com/client/v4/zones/{zone_id}/settings/maintenance_mode" \
  -H "Authorization: Bearer $CF_TOKEN" \
  -d '{"value":"on"}'
```

---

### Kubernetes Issues

**Pod Crashes**
```bash
# Check pod status
kubectl describe pod <pod-name> -n textmesh-prod

# Check previous logs
kubectl logs <pod-name> --previous -n textmesh-prod

# Common causes:
# - OOMKilled: Increase memory limits
# - CrashLoopBackOff: Check application logs
# - ImagePullBackOff: Check image registry access
```

**Node Issues**
```bash
# Check node status
kubectl get nodes

# Drain node for maintenance
kubectl drain <node-name> --ignore-daemonsets --delete-emptydir-data

# Cordon node (prevent new pods)
kubectl cordon <node-name>

# Uncordon node
kubectl uncordon <node-name>
```

---

## Maintenance Procedures

### Database Maintenance

**Vacuum and Analyze**
```bash
# Run during low traffic
psql -c "VACUUM ANALYZE;"

# For specific table
psql -c "VACUUM ANALYZE posts;"
```

**Index Maintenance**
```bash
# Check bloated indexes
psql -c "SELECT schemaname, tablename, indexname, pg_size_pretty(pg_relation_size(indexrelid)) FROM pg_stat_user_indexes ORDER BY pg_relation_size(indexrelid) DESC LIMIT 10;"

# Rebuild index
psql -c "REINDEX INDEX CONCURRENTLY idx_posts_user_created;"
```

### Redis Maintenance

**Memory Optimization**
```bash
# Check memory fragmentation
redis-cli info memory | grep mem_fragmentation_ratio

# If ratio > 1.5, restart Redis (during low traffic)
redis-cli SHUTDOWN SAVE
```

### Certificate Renewal

```bash
# Check certificate expiry
echo | openssl s_client -servername textmesh.com -connect textmesh.com:443 2>/dev/null | openssl x509 -noout -dates

# Renew with certbot
certbot renew --nginx

# Update Kubernetes secret
kubectl create secret tls textmesh-tls --cert=fullchain.pem --key=privkey.pem -n textmesh-prod --dry-run=client -o yaml | kubectl apply -f -
```

---

## Emergency Contacts

| Role | Name | Phone | Email |
|------|------|-------|-------|
| On-Call Engineer | Rotation | PagerDuty | oncall@textmesh.com |
| Engineering Lead | TBD | TBD | eng-lead@textmesh.com |
| Database Admin | TBD | TBD | dba@textmesh.com |
| Security Lead | TBD | TBD | security@textmesh.com |

## External Vendor Contacts

| Service | Support URL | Response Time |
|---------|-------------|---------------|
| AWS | https://console.aws.amazon.com/support | 15 min (Business) |
| CloudFlare | https://dash.cloudflare.com/support | 1 hour (Business) |
| Datadog | https://app.datadoghq.com/support | 1 hour |
| PagerDuty | https://support.pagerduty.com | 15 min |

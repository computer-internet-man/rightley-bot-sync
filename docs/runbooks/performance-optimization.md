# Performance Optimization Runbook

## Overview
Guidelines and procedures for optimizing performance of the AI Concierge healthcare communication platform.

## Performance Baselines

### Target Performance Metrics
- **Response Time**: < 200ms (95th percentile)
- **Database Queries**: < 50ms average
- **OpenAI API Calls**: < 2000ms
- **Memory Usage**: < 512MB per worker
- **Error Rate**: < 0.5%

### Current Performance Tracking
```bash
# Get current performance metrics
curl -s https://your-domain.com/monitoring/performance | jq

# Check Server-Timing headers
curl -I 'https://your-domain.com/api/generate-draft'

# Monitor real-time performance
wrangler tail --format=pretty | grep "Performance:"
```

## Database Optimization

### Query Performance Analysis
```bash
# Analyze slow queries
curl -s https://your-domain.com/debug/db | jq '.queryStats'

# Database health check with timing
curl -s https://your-domain.com/monitoring/health | jq '.checks[] | select(.service == "database")'
```

### Optimization Strategies

#### 1. Index Optimization
```sql
-- Add indexes for frequently queried columns
CREATE INDEX idx_users_last_active ON users(lastActiveAt);
CREATE INDEX idx_audit_logs_timestamp ON audit_logs(timestamp);
CREATE INDEX idx_draft_messages_created ON draft_messages(createdAt);
CREATE INDEX idx_finalized_messages_finalized ON finalized_messages(finalizedAt);
```

#### 2. Query Optimization
```typescript
// Use select() to limit fields
const users = await db.user.findMany({
  select: {
    id: true,
    email: true,
    role: true,
    lastActiveAt: true
  },
  where: {
    lastActiveAt: {
      gte: new Date(Date.now() - 24 * 60 * 60 * 1000)
    }
  }
});

// Use pagination for large datasets
const pagedResults = await db.auditLog.findMany({
  take: 50,
  skip: offset,
  orderBy: { timestamp: 'desc' }
});
```

#### 3. Connection Pooling
```typescript
// Optimize database connections
const db = setupDb(env.DATABASE_URL, {
  maxConnections: 10,
  connectionTimeoutMs: 5000,
  queryTimeoutMs: 10000
});
```

## API Performance Optimization

### Response Caching
```typescript
// Cache frequently accessed data
const cacheHeaders = {
  'Cache-Control': 'max-age=300, s-maxage=600',
  'ETag': generateETag(data),
  'Last-Modified': new Date().toUTCString()
};

// Conditional requests
if (request.headers.get('If-None-Match') === etag) {
  return new Response(null, { status: 304 });
}
```

### Request Optimization
```typescript
// Parallel processing
const [health, metrics, alerts] = await Promise.all([
  monitoring.getSystemHealth(),
  monitoring.getBusinessMetrics(),
  monitoring.checkAlerts()
]);

// Request deduplication
const requestKey = `${endpoint}-${userId}-${timestamp}`;
if (activeRequests.has(requestKey)) {
  return activeRequests.get(requestKey);
}
```

## OpenAI Integration Optimization

### Request Optimization
```typescript
// Optimize OpenAI requests
const optimizedRequest = {
  model: "gpt-3.5-turbo", // Use faster model when appropriate
  max_tokens: 500, // Limit response length
  temperature: 0.7,
  timeout: 30000, // 30 second timeout
  
  // Use streaming for long responses
  stream: true
};

// Implement request queuing
const rateLimiter = new RateLimiter({
  requests: 100,
  per: 'minute'
});
```

### Response Caching
```typescript
// Cache similar requests
const cacheKey = hashRequest(prompt, model, parameters);
const cachedResponse = await cache.get(cacheKey);

if (cachedResponse && !isExpired(cachedResponse)) {
  return cachedResponse;
}
```

## Memory Optimization

### Worker Memory Management
```typescript
// Monitor memory usage
const memoryUsage = process.memoryUsage();
logger.performance('Memory usage', 0, {
  heapUsed: memoryUsage.heapUsed,
  heapTotal: memoryUsage.heapTotal,
  external: memoryUsage.external
});

// Clean up large objects
const cleanup = () => {
  largeDataSets.clear();
  temporaryBuffers.forEach(buffer => buffer.clear());
  gc(); // If available
};
```

### Object Pool Management
```typescript
// Reuse objects to reduce GC pressure
class ObjectPool {
  private pool: Array<any> = [];
  
  acquire() {
    return this.pool.pop() || this.create();
  }
  
  release(obj: any) {
    this.reset(obj);
    this.pool.push(obj);
  }
}
```

## Cloudflare Workers Optimization

### Edge Computing Optimization
```typescript
// Optimize for edge deployment
const edgeOptimizations = {
  // Minimize cold start impact
  keepWarm: true,
  
  // Use Durable Objects for stateful operations
  durableObjects: {
    sessionStore: SessionDurableObject,
    queueProcessor: QueueDurableObject
  },
  
  // Optimize KV usage
  kvCache: {
    cacheTtl: 300,
    cacheEverything: false
  }
};
```

### Bundle Optimization
```javascript
// Vite configuration for optimal bundles
export default {
  build: {
    target: 'esnext',
    minify: 'terser',
    rollupOptions: {
      external: ['node:*'],
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom'],
          utils: ['date-fns', 'lodash']
        }
      }
    }
  }
};
```

## Queue Processing Optimization

### Batch Processing
```typescript
// Process messages in batches
const batchProcessor = {
  batchSize: 10,
  maxWaitTime: 5000,
  
  async processBatch(messages: QueueMessage[]) {
    const results = await Promise.allSettled(
      messages.map(msg => this.processMessage(msg))
    );
    
    return results;
  }
};
```

### Priority Queues
```typescript
// Implement priority-based processing
const queuePriorities = {
  critical: 1,
  normal: 5,
  low: 10
};

const processMessage = async (message: QueueMessage) => {
  const priority = queuePriorities[message.priority] || 5;
  await sleep(priority); // Simple priority simulation
  return processMessageContent(message);
};
```

## Monitoring Performance Improvements

### Performance Tracking
```typescript
// Track performance improvements
const performanceTracker = {
  baseline: {
    responseTime: 200,
    errorRate: 0.5,
    throughput: 100
  },
  
  current: {
    responseTime: 150,
    errorRate: 0.2,
    throughput: 150
  },
  
  improvement: {
    responseTime: '+25%',
    errorRate: '+60%',
    throughput: '+50%'
  }
};
```

### A/B Testing
```typescript
// Test performance improvements
const featureFlag = env.FEATURE_FLAGS?.includes('optimized-queries');

if (featureFlag) {
  // Use optimized query path
  return await optimizedDatabaseQuery(params);
} else {
  // Use original query path
  return await originalDatabaseQuery(params);
}
```

## Load Testing

### Performance Testing Scripts
```bash
# Load testing with curl
for i in {1..100}; do
  curl -s -w "%{time_total}\n" -o /dev/null \
    https://your-domain.com/monitoring/health &
done
wait

# Using artillery for comprehensive load testing
npx artillery run load-test.yml

# Monitor during load testing
watch -n 1 'curl -s https://your-domain.com/monitoring/performance | jq'
```

### Load Test Configuration
```yaml
# artillery.yml
config:
  target: 'https://your-domain.com'
  phases:
    - duration: 60
      arrivalRate: 10
    - duration: 120
      arrivalRate: 50
    - duration: 60
      arrivalRate: 100

scenarios:
  - name: "Health checks"
    weight: 30
    flow:
      - get:
          url: "/monitoring/health"
  
  - name: "API endpoints"
    weight: 70
    flow:
      - post:
          url: "/api/generate-draft"
          json:
            patientName: "Test Patient"
            condition: "test condition"
```

## Performance Alerts

### Alert Thresholds
```typescript
const performanceAlerts = {
  responseTime: {
    warning: 500,  // ms
    critical: 1000 // ms
  },
  errorRate: {
    warning: 1,    // %
    critical: 5    // %
  },
  throughput: {
    warning: 50,   // requests/min
    critical: 25   // requests/min
  }
};
```

### Automated Optimization
```typescript
// Auto-scaling based on performance
const autoOptimize = async () => {
  const metrics = await monitoring.getPerformanceMetrics();
  
  if (metrics.responseTime > 1000) {
    // Enable caching
    await enableResponseCaching();
    
    // Increase worker concurrency
    await scaleWorkers(2);
    
    // Alert team
    await sendAlert('Performance degradation detected, auto-optimization enabled');
  }
};
```

## Performance Review Process

### Weekly Performance Review
1. **Analyze performance trends** from monitoring data
2. **Identify bottlenecks** using profiling tools
3. **Review slow queries** and optimize indexes
4. **Update performance baselines** based on improvements

### Monthly Optimization Sprint
1. **Comprehensive performance audit**
2. **Load testing with realistic scenarios**
3. **Database optimization review**
4. **Code profiling and optimization**

### Quarterly Architecture Review
1. **Review overall system architecture**
2. **Evaluate new performance technologies**
3. **Plan major performance improvements**
4. **Update performance targets**

## Tools and Resources

### Performance Monitoring Tools
- **Sentry**: Error tracking and performance monitoring
- **Cloudflare Analytics**: Edge performance metrics
- **Custom dashboards**: Business-specific metrics
- **Server-Timing headers**: Request-level performance

### Profiling Tools
- **Chrome DevTools**: Client-side performance
- **Node.js Profiler**: Server-side performance
- **Database query analyzers**: SQL performance
- **Memory profilers**: Memory usage optimization

### Load Testing Tools
- **Artillery**: Comprehensive load testing
- **Apache Bench**: Simple load testing
- **k6**: Modern load testing
- **Lighthouse CI**: Performance regression testing

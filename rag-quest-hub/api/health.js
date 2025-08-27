export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({
      error: 'MethodNotAllowed',
      detail: 'Method not allowed',
      status_code: 405,
      timestamp: new Date().toISOString()
    });
  }

  const startTime = Date.now();
  const healthStatus = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    services: {},
    system_metrics: {
      response_time_ms: 0,
      timestamp: new Date().toISOString()
    },
    alerts: [],
    summary: {
      total_services: 0,
      healthy_services: 0,
      degraded_services: 0,
      unhealthy_services: 0
    }
  };

  const services = [];

  // Check database connection
  try {
    const dbStartTime = Date.now();
    const { getDatabase } = await import('./lib/database.js');
    const db = await getDatabase();
    await db.get('SELECT 1');
    
    // Get basic stats
    const userCount = await db.get('SELECT COUNT(*) as count FROM users');
    const docCount = await db.get('SELECT COUNT(*) as count FROM documents');
    
    const dbResponseTime = Date.now() - dbStartTime;
    
    healthStatus.services.database = {
      status: 'healthy',
      response_time_ms: dbResponseTime,
      metadata: {
        type: 'sqlite',
        user_count: userCount?.count || 0,
        document_count: docCount?.count || 0
      },
      last_check: new Date().toISOString()
    };
    services.push('healthy');
  } catch (error) {
    console.error('Database health check failed:', error);
    healthStatus.services.database = {
      status: 'unhealthy',
      error_message: error.message,
      last_check: new Date().toISOString()
    };
    healthStatus.status = 'degraded';
    services.push('unhealthy');
  }

  // Check Qdrant connection
  try {
    const qdrantStartTime = Date.now();
    const { getQdrantClient } = await import('./lib/qdrant.js');
    const qdrantClient = getQdrantClient();
    const collections = await qdrantClient.getCollections();
    const qdrantResponseTime = Date.now() - qdrantStartTime;
    
    healthStatus.services.qdrant = {
      status: 'healthy',
      response_time_ms: qdrantResponseTime,
      metadata: {
        collections_count: collections.collections?.length || 0,
        collections: collections.collections?.map(c => c.name) || []
      },
      last_check: new Date().toISOString()
    };
    services.push('healthy');
  } catch (error) {
    console.error('Qdrant health check failed:', error);
    healthStatus.services.qdrant = {
      status: 'unhealthy',
      error_message: error.message,
      last_check: new Date().toISOString()
    };
    healthStatus.status = 'degraded';
    services.push('unhealthy');
  }

  // Check Gemini API
  try {
    const geminiStartTime = Date.now();
    const { generateResponse } = await import('./lib/gemini.js');
    const testResponse = await generateResponse('Hello, respond with OK if working.');
    const geminiResponseTime = Date.now() - geminiStartTime;
    
    healthStatus.services.gemini = {
      status: 'healthy',
      response_time_ms: geminiResponseTime,
      metadata: {
        model: 'gemini-pro',
        test_response_length: testResponse?.length || 0
      },
      last_check: new Date().toISOString()
    };
    services.push('healthy');
  } catch (error) {
    console.error('Gemini health check failed:', error);
    healthStatus.services.gemini = {
      status: 'unhealthy',
      error_message: error.message,
      last_check: new Date().toISOString()
    };
    healthStatus.status = 'degraded';
    services.push('unhealthy');
  }

  // Check OpenAI embeddings
  try {
    const embeddingStartTime = Date.now();
    const { generateEmbeddings } = await import('./lib/embeddings.js');
    const testEmbedding = await generateEmbeddings('test health check');
    const embeddingResponseTime = Date.now() - embeddingStartTime;
    
    healthStatus.services.embeddings = {
      status: 'healthy',
      response_time_ms: embeddingResponseTime,
      metadata: {
        model: 'text-embedding-ada-002',
        embedding_dimension: testEmbedding?.length || 0
      },
      last_check: new Date().toISOString()
    };
    services.push('healthy');
  } catch (error) {
    console.error('Embeddings health check failed:', error);
    healthStatus.services.embeddings = {
      status: 'unhealthy',
      error_message: error.message,
      last_check: new Date().toISOString()
    };
    healthStatus.status = 'degraded';
    services.push('unhealthy');
  }

  // Calculate overall response time
  healthStatus.system_metrics.response_time_ms = Date.now() - startTime;

  // Calculate summary
  healthStatus.summary.total_services = services.length;
  healthStatus.summary.healthy_services = services.filter(s => s === 'healthy').length;
  healthStatus.summary.unhealthy_services = services.filter(s => s === 'unhealthy').length;
  healthStatus.summary.degraded_services = services.filter(s => s === 'degraded').length;

  // Check for performance alerts
  const responseTimeThreshold = 5000; // 5 seconds
  if (healthStatus.system_metrics.response_time_ms > responseTimeThreshold) {
    healthStatus.alerts.push({
      type: 'high_response_time',
      severity: 'warning',
      message: `Health check response time is ${healthStatus.system_metrics.response_time_ms}ms (threshold: ${responseTimeThreshold}ms)`,
      value: healthStatus.system_metrics.response_time_ms,
      threshold: responseTimeThreshold
    });
  }

  // Set overall status based on service health
  if (healthStatus.summary.unhealthy_services > 0) {
    healthStatus.status = 'unhealthy';
  } else if (healthStatus.summary.degraded_services > 0) {
    healthStatus.status = 'degraded';
  } else {
    healthStatus.status = 'healthy';
  }

  return res.status(200).json(healthStatus);
}
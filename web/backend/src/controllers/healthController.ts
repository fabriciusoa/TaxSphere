import { Request, Response } from 'express';
import { db, runQuery, getAll } from '../database/connection';
import { log } from '../utils/logger'; 

interface CronStatus {
  job_name: string;
  last_execution: string | null;
  status: 'success' | 'error';
  message: string | null;
  execution_time_ms: number | null;
  records_processed: number | null;
}

interface NotificationStats {
  total: number;
  enviadas: number;
  pendentes: number;
  falhas: number;
  taxa_sucesso: number;
  falhas_ultimas_24h: number;
}

interface HealthCheckResult {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  database: {
    status: 'connected' | 'disconnected';
    responseTime: number;
  };
  cron: {
    status: 'ok' | 'warning' | 'critical';
    jobs: CronStatus[];
    alerts: string[];
  };
  notifications: {
    status: 'ok' | 'warning' | 'critical';
    stats: NotificationStats;
    alerts: string[];
  };
  uptime: number;
}

// Verificar status do banco de dados
async function checkDatabase(): Promise<{ status: 'connected' | 'disconnected'; responseTime: number }> {
  const startTime = Date.now();
  try {
    await runQuery('SELECT 1');
    const responseTime = Date.now() - startTime;
    return { status: 'connected', responseTime };
  } catch (error: any) {
    log.error(`Database health check failed: ${error.message}`);
    return { status: 'disconnected', responseTime: Date.now() - startTime };
  }
}

// Verificar status dos cron jobs
async function checkCronJobs(): Promise<{ status: 'ok' | 'warning' | 'critical'; jobs: CronStatus[]; alerts: string[] }> {
  const alerts: string[] = [];
  
  try {
    // Buscar últimas execuções de cada job nas últimas 24 horas
    const rows = await getAll<any>(`
      SELECT 
        job_nome as job_name,
        executado_em as last_execution,
        CASE WHEN sucesso = 1 THEN 'success' ELSE 'error' END as status,
        erro as message,
        duracao_ms as execution_time_ms,
        registros_processados as records_processed
      FROM cron_execucoes
      WHERE executado_em >= datetime('now', '-24 hours')
      ORDER BY job_nome, executado_em DESC
    `);
    
    // Agrupar por job_name e pegar a última execução
    const jobsMap = new Map<string, CronStatus>();
    
    for (const row of rows) {
      if (!jobsMap.has(row.job_name)) {
        jobsMap.set(row.job_name, {
          job_name: row.job_name,
          last_execution: row.last_execution,
          status: row.status,
          message: row.message,
          execution_time_ms: row.execution_time_ms,
          records_processed: row.records_processed
        });
      }
    }
    
    const jobs = Array.from(jobsMap.values());
    
    // Verificar alertas
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    
    for (const job of jobs) {
      // Alerta se job não executou na última hora
      if (!job.last_execution || new Date(job.last_execution) < oneHourAgo) {
        if (job.job_name === 'processarFila') {
          alerts.push(`⚠️ Job "processarFila" não executou na última hora`);
        }
      }
      
      // Alerta se última execução falhou
      if (job.status === 'error') {
        alerts.push(`❌ Job "${job.job_name}" falhou: ${job.message || 'Erro desconhecido'}`);
      }
      
      // Alerta se job está demorando muito (>30 segundos)
      if (job.execution_time_ms && job.execution_time_ms > 30000) {
        alerts.push(`⏱️ Job "${job.job_name}" está demorando ${job.execution_time_ms}ms`);
      }
    }
    
    // Determinar status geral
    let status: 'ok' | 'warning' | 'critical' = 'ok';
    if (alerts.length > 0) {
      const hasCritical = alerts.some(a => a.includes('❌'));
      status = hasCritical ? 'critical' : 'warning';
    }
    
    return { status, jobs, alerts };
  } catch (error: any) {
    log.error(`Cron health check failed: ${error.message}`);
    return {
      status: 'critical',
      jobs: [],
      alerts: ['Erro ao verificar status dos cron jobs']
    };
  }
}

// Verificar status das notificações
async function checkNotifications(): Promise<{ status: 'ok' | 'warning' | 'critical'; stats: NotificationStats; alerts: string[] }> {
  const alerts: string[] = [];
  
  try {
    // Buscar estatísticas gerais
    const rows = await getAll<any>(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN status = 'Enviado' THEN 1 ELSE 0 END) as enviadas,
        SUM(CASE WHEN status = 'Pendente' THEN 1 ELSE 0 END) as pendentes,
        SUM(CASE WHEN status = 'Falha' THEN 1 ELSE 0 END) as falhas
      FROM notificacao
    `);
    
    const stats: NotificationStats = {
      total: rows[0]?.total || 0,
      enviadas: rows[0]?.enviadas || 0,
      pendentes: rows[0]?.pendentes || 0,
      falhas: rows[0]?.falhas || 0,
      taxa_sucesso: 0,
      falhas_ultimas_24h: 0
    };
    
    if (stats.total > 0) {
      stats.taxa_sucesso = (stats.enviadas / stats.total) * 100;
    }
    
    // Buscar falhas nas últimas 24h
    const failRows = await getAll<any>(`
      SELECT COUNT(*) as falhas_recentes
      FROM notificacao
      WHERE status = 'Falha' 
        AND criado_em >= datetime('now', '-24 hours')
    `);
    
    stats.falhas_ultimas_24h = failRows[0]?.falhas_recentes || 0;
    
    // Gerar alertas
    if (stats.pendentes > 100) {
      alerts.push(`⚠️ ${stats.pendentes} notificações pendentes na fila`);
    }
    
    if (stats.taxa_sucesso < 90 && stats.total > 10) {
      alerts.push(`📉 Taxa de sucesso baixa: ${stats.taxa_sucesso.toFixed(1)}%`);
    }
    
    if (stats.falhas_ultimas_24h > 50) {
      alerts.push(`❌ ${stats.falhas_ultimas_24h} falhas de notificação nas últimas 24h`);
    }
    
    // Determinar status
    let status: 'ok' | 'warning' | 'critical' = 'ok';
    if (stats.pendentes > 500 || stats.taxa_sucesso < 80) {
      status = 'critical';
    } else if (alerts.length > 0) {
      status = 'warning';
    }
    
    return { status, stats, alerts };
  } catch (error: any) {
    log.error(`Notifications health check failed: ${error.message}`);
    return {
      status: 'critical',
      stats: {
        total: 0,
        enviadas: 0,
        pendentes: 0,
        falhas: 0,
        taxa_sucesso: 0,
        falhas_ultimas_24h: 0
      },
      alerts: ['Erro ao verificar status das notificações']
    };
  }
}

// Health check completo
export const healthCheck = async (req: Request, res: Response) => {
  try {
    const startTime = Date.now();
    
    // Executar verificações em paralelo
    const [database, cron, notifications] = await Promise.all([
      checkDatabase(),
      checkCronJobs(),
      checkNotifications()
    ]);
    
    // Determinar status geral
    let overallStatus: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
    
    if (database.status === 'disconnected') {
      overallStatus = 'unhealthy';
    } else if (cron.status === 'critical' || notifications.status === 'critical') {
      overallStatus = 'unhealthy';
    } else if (cron.status === 'warning' || notifications.status === 'warning') {
      overallStatus = 'degraded';
    }
    
    const result: HealthCheckResult = {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      database,
      cron,
      notifications,
      uptime: process.uptime()
    };
    
    const duration = Date.now() - startTime;
    
    log.info('Health check completed', {
      status: overallStatus,
      duration: `${duration}ms`,
      alerts: [...cron.alerts, ...notifications.alerts]
    });
    
    // Retornar status HTTP apropriado
    const statusCode = overallStatus === 'healthy' ? 200 : overallStatus === 'degraded' ? 200 : 503;
    
    res.status(statusCode).json(result);
  } catch (error: any) {
    log.error(`Health check failed: ${error.message}`);
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: 'Health check failed'
    });
  }
};

// Endpoint simplificado para monitoramento externo
export const healthCheckSimple = async (req: Request, res: Response) => {
  try {
    // Apenas verificar conexão com banco
    await runQuery('SELECT 1');
    res.status(200).json({ status: 'ok' });
  } catch (error: any) {
    log.error(`Health check simple failed: ${error.message}`);
    res.status(503).json({ status: 'error' });
  }
};

// Dashboard de monitoramento (HTML)
export const healthDashboard = async (req: Request, res: Response) => {
  try {
    const [database, cron, notifications] = await Promise.all([
      checkDatabase(),
      checkCronJobs(),
      checkNotifications()
    ]);
    
    const html = `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Sistema de Monitoramento - Mentis</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
            background: #f5f5f5;
            padding: 20px;
        }
        .container { max-width: 1200px; margin: 0 auto; }
        h1 { color: #333; margin-bottom: 20px; }
        .card {
            background: white;
            border-radius: 8px;
            padding: 20px;
            margin-bottom: 20px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        .status-badge {
            display: inline-block;
            padding: 4px 12px;
            border-radius: 12px;
            font-size: 12px;
            font-weight: 600;
            text-transform: uppercase;
        }
        .status-ok { background: #4caf50; color: white; }
        .status-warning { background: #ff9800; color: white; }
        .status-critical { background: #f44336; color: white; }
        .status-connected { background: #2196f3; color: white; }
        .status-disconnected { background: #f44336; color: white; }
        .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 20px; }
        .metric { text-align: center; }
        .metric-value { font-size: 36px; font-weight: bold; color: #333; }
        .metric-label { font-size: 14px; color: #666; margin-top: 8px; }
        .alert {
            background: #fff3cd;
            border-left: 4px solid #ffc107;
            padding: 12px;
            margin-bottom: 10px;
            border-radius: 4px;
        }
        .alert-critical {
            background: #f8d7da;
            border-left-color: #dc3545;
        }
        table { width: 100%; border-collapse: collapse; margin-top: 15px; }
        th, td { padding: 12px; text-align: left; border-bottom: 1px solid #eee; }
        th { background: #f5f5f5; font-weight: 600; }
        .refresh-btn {
            background: #2196f3;
            color: white;
            border: none;
            padding: 10px 20px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 14px;
        }
        .refresh-btn:hover { background: #1976d2; }
        .timestamp { color: #666; font-size: 14px; }
    </style>
    <script>
        function autoRefresh() {
            setTimeout(() => location.reload(), 60000); // Atualizar a cada 60s
        }
        window.onload = autoRefresh;
    </script>
</head>
<body>
    <div class="container">
        <h1>🖥️ Sistema de Monitoramento - Mentis</h1>
        <p class="timestamp">Última atualização: ${new Date().toLocaleString('pt-BR')}</p>
        <button class="refresh-btn" onclick="location.reload()">🔄 Atualizar Agora</button>
        
        <!-- Status do Banco de Dados -->
        <div class="card">
            <h2>💾 Banco de Dados</h2>
            <p>
                Status: <span class="status-badge status-${database.status === 'connected' ? 'connected' : 'disconnected'}">
                    ${database.status === 'connected' ? 'Conectado' : 'Desconectado'}
                </span>
            </p>
            <p>Tempo de resposta: <strong>${database.responseTime}ms</strong></p>
        </div>
        
        <!-- Status dos Cron Jobs -->
        <div class="card">
            <h2>⏰ Cron Jobs</h2>
            <p>
                Status: <span class="status-badge status-${cron.status}">
                    ${cron.status === 'ok' ? 'OK' : cron.status === 'warning' ? 'Atenção' : 'Crítico'}
                </span>
            </p>
            
            ${cron.alerts.length > 0 ? `
                <div style="margin-top: 15px;">
                    <strong>Alertas:</strong>
                    ${cron.alerts.map(alert => `
                        <div class="alert ${alert.includes('❌') ? 'alert-critical' : ''}">${alert}</div>
                    `).join('')}
                </div>
            ` : '<p style="margin-top: 15px; color: #4caf50;">✅ Nenhum alerta</p>'}
            
            <table>
                <thead>
                    <tr>
                        <th>Job</th>
                        <th>Última Execução</th>
                        <th>Status</th>
                        <th>Tempo</th>
                        <th>Registros</th>
                    </tr>
                </thead>
                <tbody>
                    ${cron.jobs.map(job => `
                        <tr>
                            <td><strong>${job.job_name}</strong></td>
                            <td>${job.last_execution ? new Date(job.last_execution).toLocaleString('pt-BR') : 'Nunca'}</td>
                            <td>
                                <span class="status-badge status-${job.status === 'success' ? 'ok' : 'critical'}">
                                    ${job.status === 'success' ? 'Sucesso' : 'Erro'}
                                </span>
                            </td>
                            <td>${job.execution_time_ms ? `${job.execution_time_ms}ms` : '-'}</td>
                            <td>${job.records_processed || 0}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
        
        <!-- Status das Notificações -->
        <div class="card">
            <h2>📧 Notificações</h2>
            <p>
                Status: <span class="status-badge status-${notifications.status}">
                    ${notifications.status === 'ok' ? 'OK' : notifications.status === 'warning' ? 'Atenção' : 'Crítico'}
                </span>
            </p>
            
            ${notifications.alerts.length > 0 ? `
                <div style="margin-top: 15px;">
                    <strong>Alertas:</strong>
                    ${notifications.alerts.map(alert => `
                        <div class="alert ${alert.includes('❌') ? 'alert-critical' : ''}">${alert}</div>
                    `).join('')}
                </div>
            ` : '<p style="margin-top: 15px; color: #4caf50;">✅ Nenhum alerta</p>'}
            
            <div class="grid" style="margin-top: 20px;">
                <div class="metric">
                    <div class="metric-value">${notifications.stats.total}</div>
                    <div class="metric-label">Total</div>
                </div>
                <div class="metric">
                    <div class="metric-value" style="color: #4caf50;">${notifications.stats.enviadas}</div>
                    <div class="metric-label">Enviadas</div>
                </div>
                <div class="metric">
                    <div class="metric-value" style="color: #ff9800;">${notifications.stats.pendentes}</div>
                    <div class="metric-label">Pendentes</div>
                </div>
                <div class="metric">
                    <div class="metric-value" style="color: #f44336;">${notifications.stats.falhas}</div>
                    <div class="metric-label">Falhas</div>
                </div>
                <div class="metric">
                    <div class="metric-value" style="color: ${notifications.stats.taxa_sucesso >= 90 ? '#4caf50' : notifications.stats.taxa_sucesso >= 70 ? '#ff9800' : '#f44336'};">
                        ${notifications.stats.taxa_sucesso.toFixed(1)}%
                    </div>
                    <div class="metric-label">Taxa de Sucesso</div>
                </div>
                <div class="metric">
                    <div class="metric-value" style="color: ${notifications.stats.falhas_ultimas_24h > 50 ? '#f44336' : '#666'};">
                        ${notifications.stats.falhas_ultimas_24h}
                    </div>
                    <div class="metric-label">Falhas 24h</div>
                </div>
            </div>
        </div>
        
        <p style="text-align: center; color: #666; margin-top: 20px;">
            Atualização automática a cada 60 segundos
        </p>
    </div>
</body>
</html>
    `;
    
    res.send(html);
  } catch (error: any) {
    log.error(`Health dashboard failed: ${error.message}`);
    res.status(500).send('Erro ao carregar dashboard');
  }
};

import winston from 'winston';
import path from 'path';
import DailyRotateFile from 'winston-daily-rotate-file';

// Criar diretório de logs se não existir
const logsDir = process.env.LOGS_PATH
  ? path.resolve(process.env.LOGS_PATH)
  : path.join(path.resolve(__dirname, '../../../..'), 'logs');

// Formatos personalizados
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.printf(({ timestamp, level, message, stack, ...meta }) => {
    let msg = `${timestamp} [${level.toUpperCase()}]: ${message}`;
    
    // Formatar metadados de forma legível (key=value)
    if (Object.keys(meta).length > 0) {
      const metaStr = Object.entries(meta)
        .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
        .join(' ');
      msg += ` | ${metaStr}`;
    }
    
    if (stack) {
      msg += `\n${stack}`;
    }
    return msg;
  })
);

// Filtros para separar logs
const notFrontend = winston.format((info: any) => {
  return info.type !== 'frontend' ? info : false;
});

const onlyFrontend = winston.format((info: any) => {
  return info.type === 'frontend' ? info : false;
});

export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: logFormat,
  transports: [
    // Logs gerais com rotação diária e compactação automática
    new DailyRotateFile({
      filename: path.join(logsDir, 'log_app-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      zippedArchive: true,          // Compacta arquivos antigos em .gz
      maxSize: '20m',                // Rotaciona se passar 20MB no mesmo dia
      maxFiles: '30d',               // Mantém 30 dias
      format: winston.format.combine(notFrontend(), logFormat),
      auditFile: path.join(logsDir, '.audit-app.json')
    }),
    
    // Apenas erros com rotação diária
    new DailyRotateFile({
      filename: path.join(logsDir, 'log_error-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      zippedArchive: true,
      maxSize: '20m',
      maxFiles: '30d',               // Mantém 30 dias para análise
      level: 'error',
      format: winston.format.combine(notFrontend(), logFormat),
      auditFile: path.join(logsDir, '.audit-error.json')
    }),
    
    // Segurança com rotação diária
    new DailyRotateFile({
      filename: path.join(logsDir, 'log_security-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      zippedArchive: true,
      maxSize: '20m',
      maxFiles: '365d',              // 1 ano para compliance/auditoria
      level: 'warn',
      format: winston.format.combine(notFrontend(), logFormat),
      auditFile: path.join(logsDir, '.audit-security.json')
    }),
    
    // Erros do Frontend com rotação diária
    new DailyRotateFile({
      filename: path.join(logsDir, 'log_frontend-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      zippedArchive: true,
      maxSize: '20m',
      maxFiles: '90d',               // 90 dias para análise
      format: winston.format.combine(onlyFrontend(), logFormat),
      auditFile: path.join(logsDir, '.audit-frontend.json')
    })
  ]
});

// Em desenvolvimento: log no console também
if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.simple()
    )
  }));
}

// Função para extrair informações do caller automaticamente
function getCallerInfo(): { file: string; func: string } {
  const stack = new Error().stack || '';
  const lines = stack.split('\n');
  
  // Stack trace típico:
  // Error
  //   at getCallerInfo (logger.ts:XX)
  //   at log.info/error/warn (logger.ts:XX)
  //   at Object.<anonymous> (connection.ts:XX) <- queremos este
  
  const callerLine = lines[3] || lines[2] || '';
  
  // Extrair nome do arquivo
  const fileMatch = callerLine.match(/\((.+):(\d+):(\d+)\)/) || callerLine.match(/at (.+):(\d+):(\d+)/);
  let fileName = 'FileName';
  let funcName = 'Function';
  
  if (fileMatch) {
    const fullPath = fileMatch[1];
    fileName = fullPath.split(/[\\\/]/).pop() || 'FileName';
  }
  
  // Extrair nome da função
  const funcMatch = callerLine.match(/at (\w+\.)?(\w+)/);
  if (funcMatch) {
    funcName = funcMatch[2] || funcMatch[1] ;
  }
  
  return { file: fileName, func: funcName };
}

// Logger com contexto automático
export const log = {
  info: (message: string, meta?: any) => {
    const { file, func } = getCallerInfo();
    logger.info(`[${file}] [${func}] ${message}`, meta);
  },
  
  warn: (message: string, meta?: any) => {
    const { file, func } = getCallerInfo();
    logger.warn(`[${file}] [${func}] ${message}`, meta);
  },
  
  error: (message: string, meta?: any) => {
    const { file, func } = getCallerInfo();
    logger.error(`[${file}] [${func}] ${message}`, meta);
  },
  
  debug: (message: string, meta?: any) => {
    const { file, func } = getCallerInfo();
    logger.debug(`[${file}] [${func}] ${message}`, meta);
  }
};

// Helpers específicos
export const logSecurity = (message: string, meta?: any) => {
  const { file, func } = getCallerInfo();
  logger.warn(`[${file}] [${func}] ${message}`, { type: 'security', ...meta });
};

export const logAudit = (action: string, userId: number, entity: string, meta?: any) => {
  const { file, func } = getCallerInfo();
  logger.info(`[${file}] [${func}] AUDIT: ${action}`, {
    type: 'audit',
    userId,
    entity,
    ...meta
  });
};

// Helper para aguardar flush dos logs antes de sair
export const flushLogsAndExit = (code: number = 0) => {
  // Aguardar todos os transports finalizarem (pequeno delay para garantir)
  setTimeout(() => {
    logger.close();
    process.exit(code);
  }, 100);
};

// Helper para logging de erros do frontend
export const logFrontend = (errorData: {
  error_message: string;
  error_stack?: string;
  component_stack?: string;
  url: string;
  user_agent: string;
  browser_info?: string;
  userId?: number | string;
}) => {
  logger.error(`[FRONTEND] ${errorData.error_message}`, {
    type: 'frontend',
    url: errorData.url,
    userId: errorData.userId || 'não autenticado',
    userAgent: errorData.user_agent,
    browserInfo: errorData.browser_info,
    stack: errorData.error_stack,
    componentStack: errorData.component_stack
  });
};

export default logger;
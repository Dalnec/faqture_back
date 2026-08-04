const winston = require('winston');
const DailyRotateFile = require('winston-daily-rotate-file');
const pool = require('../db');
const Transport = require('winston-transport');
const path = require('path');

// Custom transport to save ONLY errors to PostgreSQL
class PostgresTransport extends Transport {
    constructor(opts) {
        super(opts);
    }

    log(info, callback) {
        setImmediate(() => {
            this.emit('logged', info);
        });

        // Insert into system_logs
        const tenant = info.tenant || 'system';
        const level = info.level;
        const message = info.message;
        
        // Remove level, message, tenant from meta to avoid duplication
        const { level: _l, message: _m, tenant: _t, ...meta } = info;
        
        const query = `
            INSERT INTO public.system_logs (tenant, level, message, meta)
            VALUES ($1, $2, $3, $4)
        `;
        const values = [tenant, level, message, Object.keys(meta).length > 0 ? JSON.stringify(meta) : null];
        
        pool.query(query, values).catch(err => {
            console.error('Failed to log to postgres:', err);
        });

        callback();
    }
}

const format = winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.json()
);

const logger = winston.createLogger({
    level: 'info',
    format: format,
    transports: [
        // Daily rotate file for all logs
        new DailyRotateFile({
            filename: path.join(__dirname, '../../logs/application-%DATE%.log'),
            datePattern: 'YYYY-MM-DD',
            zippedArchive: true,
            maxSize: '20m',
            maxFiles: '14d'
        }),
        // Daily rotate file for error logs only
        new DailyRotateFile({
            level: 'error',
            filename: path.join(__dirname, '../../logs/error-%DATE%.log'),
            datePattern: 'YYYY-MM-DD',
            zippedArchive: true,
            maxSize: '20m',
            maxFiles: '30d'
        }),
        // Custom Postgres Transport for Errors
        new PostgresTransport({
            level: 'error'
        })
    ]
});

// Also log to console in development
if (process.env.NODE_ENV !== 'production') {
    logger.add(new winston.transports.Console({
        format: winston.format.combine(
            winston.format.colorize(),
            winston.format.simple()
        )
    }));
}

module.exports = logger;

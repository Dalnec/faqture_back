import { Pool } from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

// 1. Intentar cargar el .env desde la carpeta donde se ejecuta el comando (Modo Portable/Remoto)
const portableEnv = path.join(process.cwd(), '.env');

if (fs.existsSync(portableEnv)) {
  dotenv.config({ path: portableEnv });
} else {
  // 2. Si no existe, usar el .env del backend por defecto (Modo Desarrollo Local)
  dotenv.config({ path: path.join(__dirname, '../../.env') });
}

const config = {
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || '5432', 10),
};

export const pool = new Pool(config);

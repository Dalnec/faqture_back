"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.pool = void 0;
const pg_1 = require("pg");
const dotenv_1 = __importDefault(require("dotenv"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
// 1. Intentar cargar el .env desde la carpeta donde se ejecuta el comando (Modo Portable/Remoto)
const portableEnv = path_1.default.join(process.cwd(), '.env');
if (fs_1.default.existsSync(portableEnv)) {
    dotenv_1.default.config({ path: portableEnv });
}
else {
    // 2. Si no existe, usar el .env del backend por defecto (Modo Desarrollo Local)
    dotenv_1.default.config({ path: path_1.default.join(__dirname, '../../.env') });
}
const config = {
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || '5432', 10),
};
exports.pool = new pg_1.Pool(config);

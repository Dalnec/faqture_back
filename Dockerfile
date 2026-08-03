# Imagen base
FROM node:22-alpine

# Crear directorio de trabajo
WORKDIR /usr/src/app

# Copiar package.json y package-lock.json
COPY package*.json ./

# Instalar dependencias
RUN npm install

# Copiar el resto del código
COPY . .

# Exponer puerto (tu app corre en 4000 o el que uses en src/index.js)
EXPOSE 4000

# Comando default
CMD ["npm", "run", "dev"]
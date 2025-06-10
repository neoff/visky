import swaggerUi from 'swagger-ui-express';
import YAML from 'yamljs';
import path from 'path';
import express, { Express } from 'express';
import fs from "fs";

const openApiPath = path.resolve(process.cwd(), 'docs/openapi.yaml');

if (!fs.existsSync(openApiPath)) {
  console.error('❌ openapi.yaml not found at:', openApiPath);
  process.exit(1);
}

export function setupSwagger(app: Express): void {
  const swaggerDocument = YAML.load(openApiPath);
  app.use('/v3/api-docs', (_req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.send(swaggerDocument);
  });
  app.use('/api-docs/swagger-ui-standalone-preset.js', express.static(path.join(process.cwd(), 'node_modules/swagger-ui-dist/swagger-ui-standalone-preset.js')));
  //api-docs/swagger-ui-init.js
  app.use('/api-docs/swagger-ui-init.js', express.static(path.join(process.cwd(), 'node_modules/swagger-ui-dist/swagger-ui-init.js')));
  //api-docs/swagger-ui.css
  app.use('/api-docs/swagger-ui.css', express.static(path.join(process.cwd(), 'node_modules/swagger-ui-dist/swagger-ui.css')));
  //api-docs/swagger-ui-bundle.js
  app.use('/api-docs/swagger-ui-bundle.js', express.static(path.join(process.cwd(), 'node_modules/swagger-ui-dist/swagger-ui-bundle.js')));
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));
}
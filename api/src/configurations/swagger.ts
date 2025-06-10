import swaggerUi from 'swagger-ui-express';
import YAML from 'yamljs';
import path from 'path';
import { Express } from 'express';
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
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));
}
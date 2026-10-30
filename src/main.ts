import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { configureApp } from './app.setup.js';
import { loadConfig } from './shared/config.js';

async function bootstrap() {
  const { PORT } = loadConfig();
  const app = configureApp(await NestFactory.create(AppModule));
  await app.listen(PORT);
}
await bootstrap();

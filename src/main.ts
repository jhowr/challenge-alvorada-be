import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { loadConfig } from './config/env.config';

// Validated before Nest starts, so a bad environment fails with one message.
const { PORT } = loadConfig();
const app = await NestFactory.create(AppModule);
app.enableShutdownHooks();
await app.listen(PORT);

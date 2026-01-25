import { startApp } from './app/startup';
import { initDebugLogger } from './debugLogger';

initDebugLogger();

void startApp();

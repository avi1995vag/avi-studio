import {bindings, defineConfig, triggers} from 'cf/config';

const serviceOrigin = process.env.AVI_PUBLISHER_ORIGIN;

export default defineConfig({
  worker: {
    name: 'avi-studio-publisher',
    entrypoint: './worker.mjs',
    compatibilityDate: '2026-11-11',
    workersDev: true,
    previewUrls: false,
    observability: {
      enabled: true,
      redactQueryString: true,
      logs: {enabled:true,invocationLogs:false},
      traces: {enabled:true,headSamplingRate:.05}
    },
    triggers: [triggers.scheduled({schedule:'19 * * * *'})],
    env: {
      DB: bindings.d1({name:'avi-studio-publisher'}),
      STUDIO_URL: bindings.text('https://avi1995vag.github.io/avi-studio/'),
      SERVICE_URL: bindings.text(serviceOrigin || ''),
      BUFFER_CLIENT_ID: serviceOrigin ? bindings.secret() : undefined,
      BUFFER_CLIENT_SECRET: serviceOrigin ? bindings.secret() : undefined,
      BUFFER_OWNER_EMAIL: serviceOrigin ? bindings.secret() : undefined,
      SESSION_ENCRYPTION_KEY: serviceOrigin ? bindings.secret() : undefined
    }
  }
});

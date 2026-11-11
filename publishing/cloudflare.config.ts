import {bindings, defineConfig, triggers} from 'cf/config';

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
      SERVICE_URL: bindings.text(process.env.AVI_PUBLISHER_ORIGIN || ''),
      BUFFER_CLIENT_ID: bindings.secret(),
      BUFFER_CLIENT_SECRET: bindings.secret(),
      BUFFER_OWNER_EMAIL: bindings.secret(),
      SESSION_ENCRYPTION_KEY: bindings.secret()
    }
  }
});

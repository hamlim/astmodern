import * as React from 'react'
import Document, { Html, Head, Main, NextScript } from 'next/document'

class MyDocument extends Document {
  render() {
    return (
      <Html>
        <Head>
          <title>AST Modern</title>
          <meta
            name="description"
            content="A quick and easy way to prototype babel plugins in the browser!"
          />
        </Head>
        <body>
          <div
            style={{
              display: 'flex',
              minHeight: '100vh',
              minWidth: '100vw',
              height: '100vh',
              width: '100vw',
              maxHeight: '100vh',
              maxWidth: '100vw',
              overflow: 'hidden',
              backgroundColor: '#1e1e1e',
            }}
          >
            <Main />
          </div>
          <NextScript />
          <script src="https://unpkg.com/@babel/standalone@7.9.5/babel.min.js"></script>
          <script
            type="text/javascript"
            src="https://unpkg.com/monaco-editor@0.20.0/min/vs/loader.js"
          ></script>
          <script
            dangerouslySetInnerHTML={{
              __html: `require.config({ paths: { vs: 'https://unpkg.com/monaco-editor@0.20.0/min/vs' }});

            // Before loading vs/editor/editor.main, define a global MonacoEnvironment that overwrites
            // the default worker url location (used when creating WebWorkers). The problem here is that
            // HTML5 does not allow cross-domain web workers, so we need to proxy the instantiation of
            // a web worker through a same-domain script
            window.MonacoEnvironment = {
              getWorkerUrl: function(workerId, label) {
                return \`data:text/javascript;charset=utf-8,${encodeURIComponent(`
                  self.MonacoEnvironment = {
                    baseUrl: 'https://unpkg.com/monaco-editor@0.20.0/min/'
                  };
                  importScripts('https://unpkg.com/monaco-editor@0.20.0/min/vs/base/worker/workerMain.js');`)}\`;
              }
            };

            require(["vs/editor/editor.main"], function () {
              window.isMonacoReady = true;
              if (Array.isArray(window.notifyMonacoEditorListeners)) {
                window.notifyMonacoEditorListeners.forEach(function(cb) {cb()})
              }
            });`,
            }}
          />
        </body>
      </Html>
    )
  }
}

export default MyDocument

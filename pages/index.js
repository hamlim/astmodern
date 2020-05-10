import * as React from 'react'
import { Box, ThemeProvider } from '@matthamlin/component-library'
import ErrorBoundary from '@matthamlin/error-boundary'
import useLocalStorage from '@matthamlin/use-local-storage'

import { parse } from '@babel/parser'
import generate from '@babel/generator'
import template from '@babel/template'

let {
  useRef,
  useEffect,
  useState,
  unstable_useDeferredValue: useDeferredValue,
  useLayoutEffect,
  Suspense,
} = React

function useIsomorphicEffect(effect, deps) {
  let caller = typeof window !== 'undefined' ? useLayoutEffect : useEffect
  caller(effect, deps)
}

function Editor({
  value,
  initialValue,
  onChange,
  language = 'javascript',
  minHeight = '100vh',
  theme = 'vs-dark',
}) {
  let editorEl = useRef()
  let monacoRef = useRef()

  let hasSetValue = useRef(false)

  useEffect(() => {
    if (editorEl.current) {
      function setupEditor() {
        let editor = monaco.editor.create(editorEl.current, {
          value: typeof initialValue !== 'undefined' ? initialValue : value,
          language,
          theme,
        })

        editor.onDidChangeModelContent((evt) => {
          onChange(editor.getValue())
        })

        monacoRef.current = editor
        function handleResize() {
          editor.layout()
        }
        window.addEventListener('resize', handleResize)
        return () => window.removeEventListener('resize', handleResize)
      }

      if (window.isMonacoReady) {
        setupEditor()
      }

      window.notifyMonacoEditorListeners = Array.isArray(window.notifyMonacoEditorListeners)
        ? [...window.notifyMonacoEditorListeners, setupEditor]
        : [setupEditor]
    }
  }, [])

  useEffect(() => {
    // account for hydration from local storage, on mount if the value is different then set it
    if (
      monacoRef.current &&
      monacoRef.current.getValue() !== value &&
      hasSetValue.current === false
    ) {
      monacoRef.current.setValue(value)
      hasSetValue.current = true
    }
  }, [value])

  return <div ref={editorEl} style={{ minHeight }} />
}

let parserOpts = {
  sourceType: 'module',
  allowImportExportEverywhere: true,
  allowReturnOutsideFunction: true,
  ranges: false,
  tokens: false,
  plugins: [
    'asyncGenerators',
    'classProperties',
    ['decorators', { decoratorsBeforeExport: false }],
    'doExpressions',
    'exportExtensions',
    'flow',
    'functionSent',
    'functionBind',
    'jsx',
    'objectRestSpread',
    'dynamicImport',
    'nullishCoalescingOperator',
    'numericSeparator',
    'optionalChaining',
    'optionalCatchBinding',
  ],
}

let transformOpts = {
  sourceType: 'module',
  presets: [['stage-0', { decoratorsBeforeExport: false }]],
  plugins: ['syntax-jsx'],
}

function ASTPreview({ source }) {
  return (
    <Editor
      value={JSON.stringify(parse(source, parserOpts), null, 2)}
      language="json"
      minHeight="50vh"
    />
  )
}

/*

 transform looks like:

  `export default function createAPI(babel) {
    return {}
  }`

  We can swap export default for return

  `
  function createAPI(babel) {};
  return createAPI
  `

  Then we need to pass that to `babel.transform(source, {
    ...parserOpts,
    plugins: [...parserOpts.plugins, call a function that returns the above]
  })`

  return that

*/

function swapExportForReturn({ types }) {
  return {
    visitor: {
      // replace imports with quotes
      ImportDeclaration(path) {
        let importCode = generate(path.node).code
        path.replaceWith(template.statement(`"${importCode}"`)())
      },
      // reemove or replace other `export`s in the snippet
      ExportNamedDeclaration(path) {
        const value = path.node.declaration
        if (types.isVariableDeclaration(value) || types.isFunctionDeclaration(value)) {
          path.replaceWith(value)
        } else {
          path.remove()
        }
      },
      ExportDefaultDeclaration(path) {
        const value = path.node.declaration
        // export default Demo
        if (types.isIdentifier(value)) {
          path.replaceWith(types.ReturnStatement(value))
        } else if (types.isArrowFunctionExpression(value)) {
          // export default () => {}
          const uuid = path.scope.generateUidIdentifier('export')
          const name = uuid.name
          // export default function Demo() {}
          path.replaceWithMultiple([
            // move the body of the export to be above the return
            types.VariableDeclaration('var', [types.VariableDeclarator(uuid, value)]),
            // return the exported value
            types.ReturnStatement(types.Identifier(name)),
          ])
        } else {
          // Account for anonymous exports
          // e.g. export default function() {}
          let name, funcBody
          if (!value.id) {
            const uuid = path.scope.generateUidIdentifier('export')
            name = uuid.name
            path.node.declaration.id = uuid
            funcBody = path.node.declaration
          } else {
            name = value.id.name
            funcBody = path.node.declaration
          }
          // export default function Demo() {}
          path.replaceWithMultiple([
            // move the body of the export to be above the return
            funcBody,
            // return the exported value
            types.ReturnStatement(types.Identifier(name)),
          ])
        }
      },
    },
  }
}

function doTransform({ source, transform }) {
  let withoutExportDefault = window.Babel.transform(transform, {
    ...transformOpts,
    plugins: [...transformOpts.plugins, swapExportForReturn],
  })

  let createPlugin = new Function(withoutExportDefault.code)

  let plugin = createPlugin()

  if (typeof plugin !== 'function') {
    throw new Error('No plugin was exported by default!')
  }

  try {
    return window.Babel.transform(source, {
      ...transformOpts,
      plugins: [...transformOpts.plugins, createPlugin()],
    }).code
  } catch (err) {
    throw new Error(
      `${err.message}\n${JSON.stringify(err, null, 2)}\nSource:\n${createPlugin.toString()}`,
    )
  }
}

function Transformed({ source, transform }) {
  let transformed = doTransform({ source, transform })

  return <Editor value={transformed} minHeight="50vh" />
}

function ErrorEditor({ error }) {
  return <Editor value={`${error.message}\n${error.stack}`} language="" minHeight="50vh" />
}

let sampleTransform = `export default function swapExportForReturn({ types }) {
  return {
    visitor: {
      ExportDefaultDeclaration(path) {
        const value = path.node.declaration
        // export default Demo
        if (types.isIdentifier(value)) {
          path.replaceWith(types.ReturnStatement(value))
        } else if (types.isArrowFunctionExpression(value)) {
          // export default () => {}
          const uuid = path.scope.generateUidIdentifier('export')
          const name = uuid.name
          // export default function Demo() {}
          path.replaceWithMultiple([
            // move the body of the export to be above the return
            types.VariableDeclaration('var', [
              types.VariableDeclarator(uuid, value),
            ]),
            // return the exported value
            types.ReturnStatement(types.Identifier(name)),
          ])
        } else {
          // Account for anonymous exports
          // e.g. export default function() {}
          let name, funcBody
          if (!value.id) {
            const uuid = path.scope.generateUidIdentifier('export')
            name = uuid.name
            path.node.declaration.id = uuid
            funcBody = path.node.declaration
          } else {
            name = value.id.name
            funcBody = path.node.declaration
          }
          // export default function Demo() {}
          path.replaceWithMultiple([
            // move the body of the export to be above the return
            funcBody,
            // return the exported value
            types.ReturnStatement(types.Identifier(name)),
          ])
        }
      },
    },
  }
}`

let sampleSource = `console.log('foo');
      
export default function Foo() {
  return <div />
}`

function Sandbox() {
  let [source, setSource] = useState(sampleSource)
  let [transform, setTransform] = useState(sampleTransform)

  useIsomorphicEffect(() => {
    document.getElementById('__next').style = 'width: 100vw'
  })

  let deferredSource = useDeferredValue(source, { timeoutMs: 2500 })
  let deferredTransform = useDeferredValue(transform, { timeoutMs: 2500 })

  return (
    <Box display="grid" flexGrow={1} gridTemplateColumns="1fr 1fr">
      <Box border="solid 1px">
        <Editor value={source} onChange={setSource} minHeight="50vh" />
        <Editor value={transform} onChange={setTransform} minHeight="50vh" />
      </Box>
      <Box border="solid 1px">
        <Suspense fallback="Loading AST Preview...">
          <ErrorBoundary key={deferredSource} Fallback={ErrorEditor}>
            <ASTPreview source={deferredSource} />
          </ErrorBoundary>
        </Suspense>
        <Suspense fallback="Loading transformed source...">
          <ErrorBoundary key={deferredSource + deferredTransform} Fallback={ErrorEditor}>
            <Transformed source={deferredSource} transform={deferredTransform} />
          </ErrorBoundary>
        </Suspense>
      </Box>
    </Box>
  )
}

function Wrapped() {
  let [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  if (mounted) {
    return <Sandbox />
  }
  return null
}

export default function Entry() {
  return (
    <ThemeProvider>
      <Wrapped />
    </ThemeProvider>
  )
}

'use strict'
const babelTemplate = require('@babel/template').default

const importMetaUrl = babelTemplate(String.raw`
    const PARSE_STACK = error => {
        const chromeOrEdgePattern = /^Error$/u
        const chromeErrorLine = /^\s*at\s*(.*):[0-9]+:[0-9]+$/u
        const edgeErrorLine = /^\s*at\s*.*\((.*):[0-9]+:[0-9]+\)/u
        const firefoxPattern = /^@(.*):[0-9]+:[0-9]+/u
        const safariPattern = /^(?:module|global) code@(.*):[0-9]+:[0-9]+/u

        const parsePattern = pattern => line => {
            const match = line.match(pattern)
            if (match) {
                return match[1]
            } else {
                return null
            }
        }

        const parseChrome = parsePattern(chromeErrorLine)
        const parseEdge = parsePattern(edgeErrorLine)
        const parseFirefox = parsePattern(firefoxPattern)
        const parseSafari = parsePattern(safariPattern)

        const lines = error.split(/\n/g)
        const url =
            lines[0].trim().match(chromeOrEdgePattern) && (
                parseChrome(lines[1])
                || parseEdge(lines[1])
            )
            || parseFirefox(lines[0])
            || parseSafari(lines[0])
        if (!url) {
            throw new Error("Couldn't parse error stack to get import.meta.url")
        }
        return url
    }

    const IMPORT_META_URL = PARSE_STACK(new Error().stack)
`)

const importMeta = babelTemplate(String.raw`
    const IMPORT_META = {
        url: IMPORT_META_URL,
    }
`)

const dynamicImport = babelTemplate(String.raw`
    const DEFERRED = () => {
      const def = {};
      def.promise = new Promise((resolve, reject) => {
        Object.assign(def, { resolve, reject });
      });
      return def;
    }

    const DYNAMIC_IMPORT = url => {
        const resolvedUrl = new URL(url, IMPORT_META_URL).href

        const loadingModules = Symbol.for('@jamesernator/babel-plugin-dynamic-import/loadingModules')
        if (!window[loadingModules]) {
          window[loadingModules] = {
            currentId: 0,
            loadingModules: {},
          }
        }

        const id = window[loadingModules].currentId
        window[loadingModules].currentId += 1

        const scriptTag = document.createElement('script')
        scriptTag.type = 'module'

        const whenLoaded = DEFERRED()
        window[loadingModules].loadingModules[id] = whenLoaded

        const source =
            "import * as module from" + JSON.stringify(resolvedUrl) + ";"
            + "const loadingModules = Symbol.for('@jamesernator/babel-plugin-dynamic-import/loadingModules');"
            + "window[loadingModules].loadingModules[" + id + "].resolve(module);"

        scriptTag.text = source

        scriptTag.onload = () => {
            delete window[loadingModules].loadingModules[id]
            scriptTag.remove()
        }

        scriptTag.onerror = err => {
            window[loadingModules].loadingModules[id].reject(err)
            delete window[loadingModules].loadingModules[id]
            scriptTag.remove()
        }

        document.body.appendChild(scriptTag)
        return whenLoaded.promise
    }
`)

const dynamicImportCall = babelTemplate(String.raw`
    DYNAMIC_IMPORT(URL)
`)

module.exports = function transformImportMeta({ types: t }) {
    function dynamicImportBrowser(path) {
        let foundImportMeta = false
        let foundDynamicImport = false

        const dynamicImportName = path.scope.generateUidIdentifier('dynamicImport')
        const importMetaName = path.scope.generateUidIdentifier('importMeta')

        path.traverse({
            CallExpression(path) {
                if (path.node.callee.type === 'Import') {
                    foundDynamicImport = true
                    path.replaceWith(dynamicImportCall({
                        DYNAMIC_IMPORT: dynamicImportName,
                        URL: path.node.arguments[0],
                    }))
                }
            },

            MetaProperty(path) {
                if (path.node.meta.name === 'import' && path.node.property.name === 'meta') {
                    foundImportMeta = true
                    path.replaceWith(importMetaName)
                }
            },
        })

        const importMetaUrlName = path.scope.generateUidIdentifier('importMetaUrl')

        if (foundImportMeta) {
            path.unshiftContainer('body', importMeta({
                IMPORT_META: importMetaName,
                IMPORT_META_URL: importMetaUrlName,
            }))
        }

        if (foundDynamicImport) {
            const deferredName = path.scope.generateUidIdentifier('deferred')
            path.unshiftContainer('body', dynamicImport({
                DEFERRED: deferredName,
                DYNAMIC_IMPORT: dynamicImportName,
                IMPORT_META_URL: importMetaUrlName,
                URL: t.identifier('URL'),
                JSON: t.identifier('JSON'),
            }))
        }

        if (foundImportMeta || foundDynamicImport) {
            const parseStackName = path.scope.generateUidIdentifier('parseStack')
            path.unshiftContainer('body', importMetaUrl({
                IMPORT_META_URL: importMetaUrlName,
                PARSE_STACK: parseStackName,
            }))
        }
    }

    return {
        inherits: [
            require('@babel/plugin-syntax-dynamic-import'),
            require('@babel/plugin-syntax-import-meta'),
        ],
        visitor: {
            Program: dynamicImportBrowser,
        },
    }
}

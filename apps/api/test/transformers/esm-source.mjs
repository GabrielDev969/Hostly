// @ts-check
import ts from 'typescript';

// Jest cannot require ESM, so the source of ESM workspace packages (@hostly/contracts) is compiled to CommonJS here.
// ts-jest cannot do it: it keeps the package's "type": "module" format and shares one config across transforms.
export default {
  /**
   * @param {string} sourceText
   * @param {string} sourcePath
   */
  process(sourceText, sourcePath) {
    const { outputText, sourceMapText } = ts.transpileModule(sourceText, {
      fileName: sourcePath,
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2024,
        sourceMap: true,
      },
    });
    return { code: outputText, map: sourceMapText };
  },
};

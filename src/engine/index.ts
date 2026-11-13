export { parse, classifyLines, titlePageLayout, findSpans } from './parse';
export { paginate, wrap, formatRunningTime, US_LETTER, A4, LINES_PER_INCH } from './paginate';
export { displayPages, pageIndexForLine, sourceLineOf } from './locate';
export { renderPageText, renderPagedText } from './pageText';
export {
  resolve,
  getVariables,
  listVariableKeys,
  variableUses,
  scanTokens,
  VARIABLE_KEY,
  VAR_PREFIX,
} from './variables';
export type { ResolveResult, VariableDiagnostic, VariableUse, SourceRange } from './variables';
export {
  setVariable,
  renameVariable,
  deleteVariable,
  applyChanges,
  validateKey,
  validateValue,
} from './variableEdits';
export type { TextChange, EditResult } from './variableEdits';
export * from './types';

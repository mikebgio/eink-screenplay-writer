import { Compartment } from '@codemirror/state';
import type { Extension } from '@codemirror/state';
import { EditorView, ViewPlugin } from '@codemirror/view';
import { watchHardwareKeyboard } from '../platform/device';

/** With a hardware keyboard connected the editor asks Android for no on-screen keyboard. */
export function inputModeExtension(hardwareKeyboard: boolean): Extension {
  return EditorView.contentAttributes.of(hardwareKeyboard ? { inputmode: 'none' } : {});
}

/** Follows the `Device` plugin: `inputmode="none"` while a hardware keyboard is connected. */
export function hardwareKeyboardInputMode(watch = watchHardwareKeyboard): Extension {
  const compartment = new Compartment();
  const follow = ViewPlugin.define((view) => {
    const stop = watch((connected) => {
      view.dispatch({ effects: compartment.reconfigure(inputModeExtension(connected)) });
    });
    return { destroy: stop };
  });
  return [compartment.of(inputModeExtension(false)), follow];
}

// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';

import { getFocusable } from './getFocusable';

// The focus trap is built on this list; a lost selector clause lets Tab escape the dialog.
function container(html: string): HTMLElement {
  const div = document.createElement('div');
  div.innerHTML = html;
  document.body.append(div);
  return div;
}

const namesIn = (element: HTMLElement) =>
  getFocusable(element).map((node) => node.getAttribute('data-name'));

describe('getFocusable', () => {
  it('has nothing to offer for no container at all', () => {
    expect(getFocusable(null)).toEqual([]);
  });

  it('finds nothing in a container with nothing focusable in it', () => {
    expect(getFocusable(container('<p>just words</p>'))).toEqual([]);
  });

  // One case per selector clause: a lost clause is invisible until somebody tabs onto it.
  it.each([
    ['a link with a target', '<a href="#x" data-name="a">link</a>'],
    ['a button', '<button data-name="a">press</button>'],
    ['a text field', '<input data-name="a">'],
    ['a text area', '<textarea data-name="a"></textarea>'],
    ['a select', '<select data-name="a"></select>'],
    ['anything given a tab stop', '<div tabindex="0" data-name="a"></div>'],
  ])('finds %s', (_what, html) => {
    expect(namesIn(container(html))).toEqual(['a']);
  });

  it('skips a link that goes nowhere', () => {
    expect(getFocusable(container('<a>no target</a>'))).toEqual([]);
  });

  it.each([
    ['button', '<button disabled data-name="a">press</button>'],
    ['input', '<input disabled data-name="a">'],
    ['textarea', '<textarea disabled data-name="a"></textarea>'],
    ['select', '<select disabled data-name="a"></select>'],
  ])('skips a disabled %s', (_what, html) => {
    expect(getFocusable(container(html))).toEqual([]);
  });

  // -1 means "focusable by script, not by Tab", so it must not appear here.
  it('skips an element taken out of the tab order', () => {
    expect(
      getFocusable(container('<div tabindex="-1" data-name="a"></div>')),
    ).toEqual([]);
  });

  it('skips a hidden input', () => {
    expect(
      getFocusable(container('<input type="hidden" data-name="a">')),
    ).toEqual([]);
  });

  it('skips what is not displayed or not visible', () => {
    expect(
      namesIn(
        container(
          '<button style="display:none" data-name="a">a</button>' +
            '<button style="visibility:hidden" data-name="b">b</button>' +
            '<button data-name="c">c</button>',
        ),
      ),
    ).toEqual(['c']);
  });

  it('keeps document order', () => {
    expect(
      namesIn(
        container(
          '<button data-name="first">1</button><input data-name="second"><a href="#" data-name="third">3</a>',
        ),
      ),
    ).toEqual(['first', 'second', 'third']);
  });
});

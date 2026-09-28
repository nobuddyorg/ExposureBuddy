'use client';

import type { ButtonHTMLAttributes } from 'react';

import { type ButtonVariant, iconButtonClasses } from './buttonClasses';

type IconButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
};

/** A 44px square button for one icon; callers must give it an `aria-label`. */
export function IconButton({
  variant = 'ghost',
  className = '',
  type = 'button',
  ...props
}: IconButtonProps) {
  return (
    <button
      type={type}
      className={iconButtonClasses({ variant, className })}
      {...props}
    />
  );
}

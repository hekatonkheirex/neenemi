import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import type { ButtonHTMLAttributes } from 'react';
import { cn } from '../cn';

// Los colores de texto llevan "!" porque el CSS heredado del tema claro (theme/05-ventas.css: .app-shell :where(button)) los fija con más
// especificidad. Quitar al borrar ese CSS.
/** Botón shadcn/ui con los tokens de marca: default = CTA naranja, outline/ghost = acciones secundarias. */
export const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl no-underline text-sm font-semibold transition-colors duration-150 ' +
    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky disabled:pointer-events-none disabled:opacity-50 ' +
    '[&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default: 'border border-transparent bg-brand text-navy! shadow-md hover:bg-[#e66000]',
        outline:
          'border border-navy/20 bg-white text-navy! hover:bg-sky/10 dark:border-sky/30 dark:bg-transparent dark:text-white! dark:hover:bg-sky/15',
        ghost: 'border border-transparent bg-transparent text-navy! hover:bg-sky/10 dark:text-white! dark:hover:bg-sky/15',
        upload: 'border border-sky/55 bg-sky/10 text-[#00587a]! hover:bg-sky/20 dark:text-[#8bd6f2]!',
        export: 'border border-[#2f8f5b]/50 bg-[#2f8f5b]/10 text-[#14532d]! hover:bg-[#2f8f5b]/20 dark:text-[#86e0b0]!',
        destructive: 'border border-transparent bg-[#b42318] text-white! shadow-md hover:bg-[#912018]',
      },
      size: {
        default: 'h-10 px-4',
        sm: 'h-8 px-3 text-xs',
        icon: 'size-10',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
);

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof buttonVariants> & { asChild?: boolean };

export function Button({ className, variant, size, asChild = false, type = 'button', ...props }: ButtonProps) {
  const Comp = asChild ? Slot : 'button';
  return <Comp type={asChild ? undefined : type} className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}

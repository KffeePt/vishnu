import { z } from 'zod';

export const ParticleOptionsSchema = z.object({
  numberOfBalls: z.number().optional(),
  maxActiveBalls: z.number().optional(),
  ballColors: z.array(z.string()).optional(),
  ballSpeedMin: z.number().optional(),
  ballSpeedMax: z.number().optional(),
});

export const AnimatedIconPropsSchema = ParticleOptionsSchema.extend({
  icon: z.any(), // React.ReactElement is complex to represent in Zod
  className: z.string().optional(),
  jumpAnimationClass: z.string().optional(),
  jumpAnimationDuration: z.number().optional(),
  onIconClick: z.function().args(z.any()).returns(z.void()).optional(),
});

export type AnimatedIconProps = z.infer<typeof AnimatedIconPropsSchema>;

export const NavBarPropsSchema = z.object({
  desktopSidebarState: z.enum(['expanded', 'collapsed']).optional(),
  setActiveSection: z.function().args(z.string()).returns(z.void()),
  showNav: z.boolean(),
});

export type NavBarProps = z.infer<typeof NavBarPropsSchema>;

export const AppSidebarPropsSchema = z.object({
  activeSection: z.string(),
  setActiveSection: z.function().args(z.string()).returns(z.void()),
  className: z.string().optional(),
  logoUrl: z.string().nullish(),
  isPublic: z.boolean().optional(),
  isHidden: z.boolean().optional(),
});

export type AppSidebarProps = z.infer<typeof AppSidebarPropsSchema>;

export const EnhancedErrorSchema = z.object({
  name: z.string(),
  message: z.string(),
  stack: z.string().optional(),
  response: z.any().optional(),
  statusCode: z.number().optional(),
});

export const PendingOrderDataSchema = z.object({
  items: z.array(z.any()),
  deliveryInfo: z.object({
    nombre: z.string(),
    direccion: z.string(),
    codigoPostal: z.string(),
    numeroCelular: z.string(),
    direccionesEntrega: z.string(),
  }),
  deliveryDateTime: z.object({
    fecha: z.union([z.string(), z.date(), z.null()]),
    hora: z.string(),
  }),
  paymentMethod: z.string(),
  orderId: z.string().optional(),
  restaurantId: z.string().optional(),
});

export type EnhancedError = z.infer<typeof EnhancedErrorSchema>;
export type PendingOrderData = z.infer<typeof PendingOrderDataSchema>;
export const AuthFormPropsSchema = z.object({
  onGoogleSignIn: z.function().returns(z.promise(z.void())),
  onFacebookSignIn: z.function().returns(z.promise(z.void())),
  loading: z.boolean(),
  error: EnhancedErrorSchema.nullable(),
  pendingOrderData: PendingOrderDataSchema.nullable(),
});

export type AuthFormProps = z.infer<typeof AuthFormPropsSchema>;
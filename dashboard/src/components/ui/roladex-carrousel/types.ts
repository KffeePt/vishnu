export interface CarouselItem {
  id: string;
  title: string;
  subtitle?: string;
  description: string;
  photoTitle?: string;
  photoSubtitle?: string;
  imageUrl: string;
  author: string;
  url?: string;
  type?: 'image' | 'video';
  aspectRatioHorizontal?: string;
  aspectRatioVertical?: string;
}
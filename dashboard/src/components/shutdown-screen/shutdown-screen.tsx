'use client';

import { motion } from 'framer-motion';
import { ShutdownConfig } from '@/hooks/use-site-config';
import HalftoneWaves from '../ui/halftone-waves';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';

interface ShutdownScreenProps {
  config: ShutdownConfig | null;
}

const ShutdownScreen = ({ config }: ShutdownScreenProps) => {
  if (!config || !config.isShutdown) {
    return null;
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 1 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-background"
    >
      <HalftoneWaves color={config.waveColor} />
      <Card className="z-10 bg-background/80 backdrop-blur-sm text-center">
        <CardHeader>
          <CardTitle className="text-2xl">{config.title}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xl">{config.subtitle}</p>
          <p className="text-md text-muted-foreground">{config.message}</p>
        </CardContent>
      </Card>
    </motion.div>
  );
};

export default ShutdownScreen;
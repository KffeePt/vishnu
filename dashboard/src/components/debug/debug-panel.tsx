import React, { useState } from 'react';
import { ChevronDown, ChevronRight, Bug } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface DebugPanelProps {
    title?: string;
    data: Record<string, any> | any[];
    visible?: boolean;
    defaultExpanded?: boolean;
}

export function DebugPanel({ title = 'Debug Data', data, visible = true, defaultExpanded = false }: DebugPanelProps) {
    const [isExpanded, setIsExpanded] = useState(defaultExpanded);

    if (!visible || process.env.NODE_ENV !== 'development') {
        return null;
    }

    return (
        <Card className="mt-8 border-dashed border-red-500/50 bg-red-500/5 overflow-hidden">
            <CardHeader
                className="py-3 cursor-pointer hover:bg-red-500/10 transition-colors flex flex-row items-center justify-between"
                onClick={() => setIsExpanded(!isExpanded)}
            >
                <CardTitle className="text-sm font-mono flex items-center gap-2 text-red-700 dark:text-red-400">
                    <Bug className="h-4 w-4" />
                    {title}
                </CardTitle>
                {isExpanded ? <ChevronDown className="h-4 w-4 text-red-500" /> : <ChevronRight className="h-4 w-4 text-red-500" />}
            </CardHeader>

            {isExpanded && (
                <CardContent className="p-0 border-t border-red-500/20">
                    <pre className="p-4 overflow-x-auto text-[10px] font-mono text-muted-foreground whitespace-pre-wrap break-all">
                        {JSON.stringify(data, null, 2)}
                    </pre>
                </CardContent>
            )}
        </Card>
    );
}

export default DebugPanel;

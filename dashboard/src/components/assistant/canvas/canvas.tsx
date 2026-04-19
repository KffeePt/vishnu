import React, { useState, useEffect } from 'react';
import LoadingSpinner from '@/components/loading-spinner';

interface CanvasProps {
  code: string;
}

const Canvas = ({ code }: CanvasProps) => {
  const [iframeContent, setIframeContent] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const isHtml = /<!DOCTYPE html>|<html/i.test(code);

    if (isHtml) {
      setIframeContent(code);
    } else {
      const html = `
        <html>
          <head>
            <style>
              body { margin: 0; background-color: #1e1e1e; color: white; font-family: sans-serif; }
            </style>
            <script src="https://unpkg.com/react@18/umd/react.development.js" crossorigin></script>
            <script src="https://unpkg.com/react-dom@18/umd/react-dom.development.js" crossorigin></script>
            <script src="https://unpkg.com/@babel/standalone/babel.min.js" crossorigin></script>
          </head>
          <body>
            <div id="root"></div>
            <script type="text/babel">
              try {
                const App = (() => {
                  ${code
                    .replace(/^\s*import.*?;?\s*$/gm, '') // Remove all import lines
                    .replace(/export default/, 'return ')
                    .replace(/^\s*.*(createRoot|ReactDOM\.render).*?;?\s*$/gm, '')} // Remove render lines
                })();
                
                if (typeof App !== 'function' && (typeof App !== 'object' || App === null)) {
                  throw new Error('The code does not export a valid React component.');
                }

                const root = ReactDOM.createRoot(document.getElementById('root'));
                root.render(React.createElement(App));
              } catch (error) {
                document.getElementById('root').innerHTML = '<pre style="color: red; padding: 1rem;">' + error.stack + '</pre>';
              }
            </script>
          </body>
        </html>
      `;
      setIframeContent(html);
    }
    setTimeout(() => setLoading(false), 200);
  }, [code]);

  return (
    <div className="bg-transparent text-white p-4 flex flex-col h-full">
      <h2 className="text-lg font-semibold mb-4">Preview</h2>
      <div className="flex-grow bg-black bg-opacity-20 rounded-md relative flex items-center justify-center">
        {loading ? (
          <LoadingSpinner />
        ) : (
          <iframe
            srcDoc={iframeContent}
            title="Preview"
            sandbox="allow-scripts allow-same-origin"
            className="absolute top-0 left-0 w-full h-full overflow-y-scroll border-0"
          />
        )}
      </div>
    </div>
  );
};

export default Canvas;
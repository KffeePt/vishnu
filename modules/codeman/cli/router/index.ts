export const commands = {
    build: () => import('./build/index'),
    deploy: () => import('./deploy/index'),
    dev: () => import('./dev/index'),
    test: () => import('./test/index'),
    update: () => import('./update/index')
};


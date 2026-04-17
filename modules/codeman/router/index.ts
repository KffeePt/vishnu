export const routes = {
    welcome: () => import('./welcome/index'),
    loading: () => import('./loading/index'),
    idle: () => import('./idle/index'),
    error: () => import('./debug/error/index'),
    settings: () => import('./settings/index'),
    restart: () => import('./restart/index'),
    exit: () => import('./exit/index'),
    main: () => import('./main/menu')
};


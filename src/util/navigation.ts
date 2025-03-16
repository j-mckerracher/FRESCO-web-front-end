// src/util/navigation.ts
import { useRouter as useNextRouter } from 'next/router';
import {
    useNavigate as useReactRouterNavigate,
    useLocation,
    NavigateOptions
} from 'react-router-dom';

/**
 * A hook that provides navigation functionality compatible with both
 * Next.js and React Router, allowing for incremental migration
 */
export function useNavigation() {
    // Try to use React Router's useNavigate, which will throw an error if not in a Router context
    let reactNavigate;
    let reactLocation;
    let isReactRouter = false;

    try {
        reactNavigate = useReactRouterNavigate();
        reactLocation = useLocation();
        isReactRouter = true;
    } catch (e) {
        // Not in a React Router context, will use Next.js router
    }

    // Use Next.js router as fallback
    const nextRouter = useNextRouter();

    /**
     * Navigate to a path using either React Router or Next.js Router
     */
    const navigate = (path: string, options?: NavigateOptions) => {
        if (isReactRouter) {
            reactNavigate(path, options);
        } else {
            // Handle Next.js navigation
            nextRouter.push(path);
        }
    };

    /**
     * Get the current path/location
     */
    const getCurrentPath = () => {
        if (isReactRouter) {
            return reactLocation.pathname;
        } else {
            return nextRouter.pathname;
        }
    };

    return {
        navigate,
        getCurrentPath,
        isUsingReactRouter: isReactRouter
    };
}
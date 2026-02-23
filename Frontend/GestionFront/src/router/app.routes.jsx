import { createBrowserRouter } from "react-router";
import { App } from '../Dashboard/pages/App.jsx';
import { AuthPage } from '../Authentication/pages/AuthPage.jsx';

export const router = createBrowserRouter([
    {
        path: "/",
        element: <App />
    },
    {
        path: "/auth",
        element: <AuthPage />
    }
]);
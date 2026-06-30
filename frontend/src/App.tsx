import { Routes, Route } from "react-router-dom";
import Layout from "./components/Layout";
import LibraryPage from "./pages/LibraryPage";
import ItemDetailPage from "./pages/ItemDetailPage";
import SettingsPage from "./pages/SettingsPage";
import { ToastProvider } from "./lib/toast";

export default function App() {
  return (
    <ToastProvider>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<LibraryPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/server/:serverId/item/:itemId" element={<ItemDetailPage />} />
        </Route>
      </Routes>
    </ToastProvider>
  );
}

import { Sidebar } from "./sidebar";
import { TopBar } from "./topbar";

interface LayoutProps {
  children: React.ReactNode;
  title: string;
  description: string;
  onAddClick?: () => void;
  showAddButton?: boolean;
  addButtonText?: string;
  onBulkUploadClick?: () => void;
}

export function Layout({ 
  children, 
  title, 
  description, 
  onAddClick, 
  showAddButton = true, 
  addButtonText = "Add Asset",
  onBulkUploadClick 
}: LayoutProps) {
  return (
    <div className="flex h-screen bg-[var(--background)] text-text_primary">
      <Sidebar />
      
      <main className="flex flex-col flex-1 md:ml-64 overflow-auto bg-[var(--background)] px-4 sm:px-6 lg:px-10 py-6 space-y-6">
        <TopBar 
          title={title}
          description={description}
          onAddClick={onAddClick}
          showAddButton={showAddButton}
          addButtonText={addButtonText}
          onBulkUploadClick={onBulkUploadClick}
        />
        <div className="flex-1">
          {children}
        </div>
      </main>
    </div>
  );
}

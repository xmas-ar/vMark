// filepath: /home/xmas/GIT-PG/vMark/frontend/src/components/Modal.tsx
import React from 'react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}

const Modal: React.FC<ModalProps> = ({ isOpen, onClose, title, children }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50"> {/* Added z-index */}
      <div className="bg-gray-800 rounded-xl max-w-md w-full p-6 shadow-lg"> {/* Added shadow */}
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-xl font-bold text-gray-100">{title}</h3> {/* Ensure text color */}
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white text-2xl leading-none" // Adjusted style
          >
            &times; {/* Use HTML entity for 'X' */}
          </button>
        </div>
        {children}
      </div>
    </div>
  );
};

export default Modal;
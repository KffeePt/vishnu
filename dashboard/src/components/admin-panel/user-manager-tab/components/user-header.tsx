"use client";

import React from 'react';
import { RiContactsBook2Line } from "react-icons/ri";

interface UserHeaderProps {
  userCount: number;
}

const UserHeader: React.FC<UserHeaderProps> = ({ userCount }) => {
  return (
    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
      <h2 className="text-2xl font-semibold tracking-tight flex items-center gap-2 mx-auto">
        <RiContactsBook2Line /> Gestión de Usuarios ({userCount})
      </h2>
    </div>
  );
};

export default UserHeader;
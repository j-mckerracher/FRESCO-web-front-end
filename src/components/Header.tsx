import React from "react";

const Header = () => {
  return (
    <header className="flex justify-between items-center p-5">
      <div className="text-4xl font-bold text-purdue-boilermakerGold font-logo">
        FRESCO
      </div>
      <nav className="flex text-lg font-semibold space-x-8 text-purdue-boilermakerGold">
        <a href="#">Home</a>
        <a href="#">About</a>
        <a href="#">Team</a>
        <a href="#">News</a>
      </nav>
    </header>
  );
};

export default Header;

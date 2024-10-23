import React from "react";
import Image from "next/image";
import Link from "next/link";

const Hero = () => {
  return (
    <section className="text-center py-10 bg-black text-white">
      <div className="relative w-full h-[50vh]">
        <Image
          src="/assets/landing.png"
          alt="Eclipse"
          fill
          sizes="100vw"
          objectFit="contain"
        />
      </div>
      <div className="mt-4 flex flex-col justify-center items-center gap-4">
        <Link href='auth'>
        <button className="bg-purdue-boilermakerGold text-black font-semibold px-4 py-2 rounded-full text-2xl">
          Explore the dataset!
        </button>
        </Link>
        {/* <div className="flex flex-row gap-4">
          <button className="bg-purdue-boilermakerGold text-black font-semibold px-4 py-2 rounded-full">
            Monthly Slices
          </button>
          <button className="bg-purdue-boilermakerGold text-black font-semibold px-4 py-2 rounded-full">
            Custom Query
          </button>
        </div> */}
      </div>
    </section>
  );
};

export default Hero;

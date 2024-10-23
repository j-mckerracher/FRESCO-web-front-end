import Hero from "@/components/landing/Hero";
import Header from "../components/Header";
// import MainSection from "../components/MainSection";
// import Footer from "../components/Footer";

const Home = () => {
  return (
    <div className="bg-black">
      <Header />
      <Hero />
      <section className="text-white py-16">
        <div className="flex justify-center">
          <div className="w-full max-w-4xl h-64 bg-gray-700 flex items-center justify-center">
            <p>Screenshot / GIF showing data analysis dashboard workflow</p>
          </div>
        </div>
      </section>
      {/* <MainSection /> */}
      {/* <Footer /> */}
    </div>
  );
};

export default Home;

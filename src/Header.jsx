import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";

function Header() {
    const { t } = useTranslation('header');

    return (
        <header className="bg-white text-black shadow-md p-4 flex items-center justify-between w-full">
            {/* Left Section: Logo and Title */}
            <div className="flex items-center">
                <img src="/logoTrans.png" alt="FinBridge Logo" className="h-10 w-10 mr-4" />
                <h1 className="text-left font-serif text-3xl font-medium">FinBridge</h1>
            </div>

            {/* Center Section: Tagline */}
            <h3 className="text-center font-serif text-xl font-medium absolute left-1/2 transform -translate-x-1/2">
                {t("tagline")}
            </h3>

            {/* Right Section: Navigation */}
            <nav className="flex items-center">
                <ul className="flex">
                    <li className="inline-block mx-4">
                        <Link to="/home">{t("home")}</Link>
                    </li>
                    <li className="inline-block mx-4">
                        <Link to="/dashboard">{t("dashboard")}</Link>
                    </li>
                    <li className="inline-block mx-4">
                        <Link to="/explain">{t("explain", { defaultValue: "Explain" })}</Link>
                    </li>
                    <li className="inline-block mx-4">
                        <Link to="/credit">{t("credit", { defaultValue: "Credit" })}</Link>
                    </li>
                    <li className="inline-block mx-4">
                        <Link to="/about">{t("about")}</Link>
                    </li>
                </ul>
            </nav>
        </header>
    );
}

export default Header;
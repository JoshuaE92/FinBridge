import Chatbot from './Chatbot.jsx';
import AccountDashboard from './AccountDashboard.jsx';

function Dashboard() {
    return (
        <div className="min-h-screen bg-gray-50">
            <AccountDashboard />
            <Chatbot />
        </div>
    );
}

export default Dashboard;

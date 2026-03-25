import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import './Login.scss';

const AdminLogin = () => {
    const [email, setEmail] = useState('admin@academy.com');
    const [password, setPassword] = useState('admin123');
    const [error, setError] = useState('');
    const navigate = useNavigate();

    const handleLogin = async (e) => {
        e.preventDefault();
        
        try {
            const response = await axios.post('http://localhost:5000/api/auth/login', {
                email,
                password
            });
            
            localStorage.setItem('token', response.data.token);
            localStorage.setItem('user', JSON.stringify(response.data.user));
            navigate('/admin');
            
        } catch (err) {
            setError('Invalid credentials. Use: admin@academy.com / admin123');
        }
    };

    return (
        <div className="admin-login">
            <div className="login-container">
                <div className="login-header">
                    <h1>Gorythm Academy</h1>
                    <p>Admin Portal Login</p>
                </div>
                
                <form onSubmit={handleLogin}>
                    <div className="form-group">
                        <label>Email Address</label>
                        <input
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            required
                        />
                    </div>
                    
                    <div className="form-group">
                        <label>Password</label>
                        <input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                        />
                    </div>
                    
                    {error && <div className="error-message">{error}</div>}
                    
                    <button type="submit" className="login-btn">Login to Dashboard</button>
                    
                    <div className="login-info">
                        <p><strong>Default credentials:</strong></p>
                        <p>Email: admin@academy.com</p>
                        <p>Password: admin123</p>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default AdminLogin;
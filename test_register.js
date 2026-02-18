const axios = require('axios');
const FormData = require('form-data');

async function testRegistration() {
    try {
        const form = new FormData();
        form.append('name', 'Test Athlete');
        form.append('email', `testuser_${Date.now()}@example.com`);
        form.append('contactNo', '1234567890');
        form.append('universityName', 'Test University');
        form.append('address', 'Test City');

        const items = [
            { id: 'football', title: 'Football', price: 500 },
            { id: 'cricket', title: 'Cricket', price: 1000 }
        ];
        form.append('items', JSON.stringify(items));

        console.log('Sending registration request...');
        const response = await axios.post('http://localhost:5000/register', form, {
            headers: {
                ...form.getHeaders()
            }
        });

        console.log('Response Status:', response.status);
        console.log('Response Data:', response.data);

        if (response.data.success) {
            console.log('✅ Registration Test Passed!');
        } else {
            console.log('❌ Registration Failed:', response.data.message);
        }
    } catch (error) {
        if (error.code === 'ECONNREFUSED') {
            console.log('❌ Connection Refused. Is the backend server running on port 5000?');
        } else {
            console.error('❌ Test Error:', error.message);
            if (error.response) {
                console.error('Server Response:', error.response.data);
            }
        }
    }
}

testRegistration();

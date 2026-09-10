const express = require('express');
const config = require('./config');
const eventsRouter = require('./routes/events');
const broadcastRouter = require('./routes/broadcast');
const groupsRouter = require('./routes/groups');
const rolesRouter = require('./routes/roles');
const membersRouter = require('./routes/members');
const attendanceRouter = require('./routes/attendance');
const safetyRouter = require('./routes/safety');
const transactionsRouter = require('./routes/transactions');

const app = express();

app.get('/', (req, res) => res.redirect('/admin/broadcast.html'));

app.use('/api/events', express.json(), eventsRouter);
app.use('/api/broadcast', express.json(), broadcastRouter);
app.use('/api/groups', express.json(), groupsRouter);
app.use('/api/roles', express.json(), rolesRouter);
app.use('/api/members', express.json(), membersRouter);
app.use('/api/attendance', express.json(), attendanceRouter);
app.use('/api/safety', express.json(), safetyRouter);
app.use('/api/transactions', express.json(), transactionsRouter);

app.use(express.static('public'));

app.listen(config.port, () => {
  console.log(`サーバーが起動しました: http://localhost:${config.port}`);
});

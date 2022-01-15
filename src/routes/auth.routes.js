const {Router} = require('express');

const router = Router();

const { checkDuplicateUsernameOrEmail } = require('../middlewares/verifySignUp')
const { signUp, signIn, changePassword, getUsers, getUserId, updateUser } = require('../controllers/auth.controller')

router.post('/signup', checkDuplicateUsernameOrEmail, signUp)
router.post('/signin', signIn)
router.post('/change-password/:username', changePassword)
router.get('/users', getUsers)
router.get('/users/:id', getUserId)
router.put('/users/:id', updateUser)

module.exports = router;
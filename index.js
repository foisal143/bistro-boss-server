const express = require('express');
const app = express();
const cors = require('cors');
const port = process.env.PORT || 5000;
require('dotenv').config();
const stripe = require('stripe')(process.env.STRIPE_CLIENT_SCREET);
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const jwt = require('jsonwebtoken');

// middleware
app.use(cors());
app.use(express.json());

const verifyJwt = (req, res, next) => {
  const authorization = req.headers.authorization;

  if (!authorization) {
    return res
      .status(401)
      .send({ error: true, message: 'unauthorized access' });
  }
  const token = authorization.split(' ')[1];

  jwt.verify(token, process.env.JWT_ACCESS_TOKEN, (err, decode) => {
    if (err) {
      return res
        .status(401)
        .send({ error: true, message: 'unauthorized access' });
    }
    req.decode = decode;
    next();
  });
};

// jwt apis

app.post('/jwt', (req, res) => {
  const email = req.body;
  const token = jwt.sign(email, process.env.JWT_ACCESS_TOKEN, {
    expiresIn: '5h',
  });

  res.send({ token });
});

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.mrvtr8q.mongodb.net/?retryWrites=true&w=majority`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();
    const reviewColection = client.db('bistroboss').collection('reviews');
    const menusColection = client.db('bistroboss').collection('menus');
    const cartColection = client.db('bistroboss').collection('carts');
    const userColection = client.db('bistroboss').collection('users');
    const paymentColection = client.db('bistroboss').collection('payments');
    const bookingCollection = client.db('bistroboss').collection('bookings');
    // verify admin middleware
    const verifyAdmin = async (req, res, next) => {
      const email = req.decode.email;
      const query = { email: email };
      const user = await userColection.findOne(query);
      if (!user?.role === 'admin') {
        res.status(403).send({ error: true, message: 'forbidden access' });
      }
      next();
    };

    // review apis
    app.post('/reviews', verifyJwt, async (req, res) => {
      const review = req.body;
      const result = await reviewColection.insertOne(review);
      res.send(result);
    });

    app.get('/reviews', async (req, res) => {
      const result = await reviewColection.find().toArray();
      res.send(result);
    });

    // user apis here
    app.post('/users', async (req, res) => {
      const user = req.body;

      const query = { email: user.email };
      const exist = await userColection.findOne(query);
      if (exist) {
        return [];
      }
      const result = await userColection.insertOne(user);
      res.send(result);
    });

    app.get('/users', verifyJwt, async (req, res) => {
      const users = userColection.find();
      const result = await users.toArray();
      res.send(result);
    });

    app.delete('/users/:id', verifyJwt, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await userColection.deleteOne(query);
      res.send(result);
    });

    app.patch('/users/:id', verifyJwt, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const updatedData = {
        $set: {
          role: 'admin',
        },
      };
      const result = await userColection.updateOne(filter, updatedData);
      res.send(result);
    });

    app.get('/users/admin/:email', verifyJwt, async (req, res) => {
      const email = req.params.email;
      const query = { email: email };
      const user = await userColection.findOne(query);
      const result = { admin: user?.role === 'admin' };
      res.send(result);
    });

    // menus here
    app.get('/menus', async (req, res) => {
      const data = await menusColection.find().toArray();
      res.send(data);
    });

    app.get('/menus/:id', async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await menusColection.findOne(query);
      res.send(result);
    });

    app.post('/menus', verifyJwt, verifyAdmin, async (req, res) => {
      const menu = req.body;
      const result = await menusColection.insertOne(menu);
      res.send(result);
    });

    app.put('/menus/:id', verifyJwt, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const menu = req.body;
      const options = { upsert: true };
      const updatedMenu = {
        $set: {
          name: menu.name,
          category: menu.category,
          price: menu.price,
          recipe: menu.recipe,
          image: menu.image,
        },
      };
      const result = await menusColection.updateOne(
        filter,
        updatedMenu,
        options
      );
      res.send(result);
    });

    app.delete('/menus/:id', verifyJwt, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await menusColection.deleteOne(query);
      res.send(result);
    });
    // cart data here
    app.post('/carts', async (req, res) => {
      const cart = req.body;
      const result = await cartColection.insertOne(cart);
      res.send(result);
    });

    app.get('/carts', verifyJwt, async (req, res) => {
      const email = req.query.email;
      const decode = req.decode;
      if (email !== decode.email) {
        return res.send({ error: true, message: 'forbidden access' });
      }
      const query = { email: email };
      const result = await cartColection.find(query).toArray();
      res.send(result);
    });

    app.delete('/carts/:id', async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await cartColection.deleteOne(query);
      res.send(result);
    });

    // payment system apis
    app.post('/payment-post-api', verifyJwt, async (req, res) => {
      const { price } = req.body;
      const amount = price * 100;
      if (amount > 0) {
        const paymentIntent = await stripe.paymentIntents.create({
          amount: amount,
          currency: 'usd',
          payment_method_types: ['card'],
        });
        res.send({ clientSecret: paymentIntent.client_secret });
      }
    });

    // payment history api
    app.post('/payments', verifyJwt, async (req, res) => {
      const payment = req.body;
      const insertedResult = await paymentColection.insertOne(payment);
      const cartId = payment.cartsId;
      const query = {
        _id: { $in: cartId.map(id => new ObjectId(id)) },
      };
      const deletedResult = await cartColection.deleteMany(query);
      res.send({ insertedResult, deletedResult });
    });

    app.get('/payments/:email', verifyJwt, async (req, res) => {
      const email = req.params.email;
      const query = { email: email };
      const result = await paymentColection.find(query).toArray();
      res.send(result);
    });

    // booking apis
    app.post('/bookings', verifyJwt, async (req, res) => {
      const booking = req.body;
      const result = await bookingCollection.insertOne(booking);
      res.send(result);
    });

    app.get('/bookings', verifyJwt, async (req, res) => {
      const email = req.query.email;
      let query = {};
      if (query) {
        query = { email: email };
      }
      if (!email) {
        const result = await bookingCollection.find().toArray();
        res.send(result);
        return;
      }
      const result = await bookingCollection.find(query).toArray();
      res.send(result);
    });

    app.patch('/bookings/:id', verifyJwt, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const updatedStatus = {
        $set: {
          status: 'Approved',
        },
      };
      const result = await bookingCollection.updateOne(filter, updatedStatus);
      res.send(result);
    });

    app.delete('/bookings/:id', verifyJwt, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await bookingCollection.deleteOne(query);
      res.send(result);
    });

    // admin home revinue,users,menus count apis
    app.get('/counts', verifyJwt, verifyAdmin, async (req, res) => {
      const userCount = await userColection.estimatedDocumentCount();
      const menuCount = await menusColection.estimatedDocumentCount();
      const orderCount = await paymentColection.estimatedDocumentCount();
      const payments = await paymentColection.find().toArray();
      const total = payments.reduce((sum, value) => sum + value.price, 0);
      const revinue = parseFloat(total.toFixed(2));

      res.send({ userCount, menuCount, orderCount, revinue });
    });

    app.get('/menu-stage', verifyJwt, verifyAdmin, async (req, res) => {
      const payments = await paymentColection.find().toArray();
      const allPaymentIds = [];
      payments.forEach(async payment => {
        const paymentIds = payment.menuId;
        allPaymentIds.push(...paymentIds);
      });
      const query = { _id: { $in: allPaymentIds.map(id => new ObjectId(id)) } };

      const orderedItems = await menusColection.find(query).toArray();
      const salads = orderedItems.filter(item => item.category === 'salad');
      const saladPrice = salads.reduce((pre, value) => pre + value.price, 0);
      const pizzas = orderedItems.filter(item => item.category === 'pizza');
      const pizzaPrice = pizzas.reduce((pre, value) => pre + value.price, 0);
      const soup = orderedItems.filter(item => item.category === 'soup');
      const soupPrice = soup.reduce((pre, value) => pre + value.price, 0);
      const dessert = orderedItems.filter(item => item.category === 'dessert');
      const dessertPrice = dessert.reduce((pre, value) => pre + value.price, 0);
      const drink = orderedItems.filter(item => item.category === 'drinks');
      const drinkPrice = drink.reduce((pre, value) => pre + value.price, 0);
      const data = [
        { category: 'salad', count: salads.length, price: saladPrice },
        { category: 'pizza', count: pizzas.length, price: pizzaPrice },
        { category: 'soup', count: soup.length, price: soupPrice },
        { category: 'drink', count: drink.length, price: drinkPrice },
        { category: 'dessert', count: dessert.length, price: dessertPrice },
      ];

      res.send(data);
    });

    // user home orders ,review,payments apis
    app.get('/user-stage/:email', verifyJwt, async (req, res) => {
      const email = req.params.email;
      const query = { email: email };

      const orders = await paymentColection.find(query).toArray();
      const review = await reviewColection.find(query).toArray();
      const booking = await bookingCollection.find(query).toArray();
      const data = {
        orderCount: orders.length,
        reviewCount: review.length,
        bookingCount: booking.length,
        paymentCount: orders.length,
      };
      res.send(data);
    });
    // Send a ping to confirm a successful connection
    await client.db('admin').command({ ping: 1 });
    console.log(
      'Pinged your deployment. You successfully connected to MongoDB!'
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get('/', (req, res) => {
  res.send('food data is comming');
});

app.listen(port, () => {
  console.log('server is running on port', port);
});

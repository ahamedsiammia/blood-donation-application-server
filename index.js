const express = require("express");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

require("dotenv").config();
const port = process.env.PORT || 3000;
const stripe = require("stripe")(process.env.STRIPE_SECRAT);
const crypto = require("crypto");

const app = express();
app.use(cors());
app.use(express.json());

const admin = require("firebase-admin");
const decoded = Buffer.from(process.env.FB_SERVICE_KEY, "base64").toString(
  "utf8"
);
const serviceAccount = JSON.parse(decoded);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const verifyFBToken = async (req, res, next) => {
  const token = req.headers.authorization;

  if (!token) {
    return res.status(401).send({ message: "unauthoriz access" });
  }

  try {
    const idToken = token.split(" ")[1];
    const decoded = await admin.auth().verifyIdToken(idToken);
    console.log("decode info", decoded);
    req.decoded_email = decoded.email;
    next();
  } catch (error) {
    return res.status(401).send({ message: "unauthoriz access" });
  }
};

const uri = `mongodb+srv://${process.env.USER_NAME}:${process.env.USER_PASSWORD}.im5itev.mongodb.net/?appName=Cluster0`;

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
    const db = client.db("project11");
    const usersCollection = db.collection("user");
    const requestColocation = db.collection("request");
    const paymentColocation = db.collection("payment");

    app.post("/user", async (req, res) => {
      const userInfo = req.body;
      userInfo.role = "donor";
      userInfo.status = "active";
      userInfo.createAt = new Date();
      const result = await usersCollection.insertOne(userInfo);
      res.send(result);
    });

    // all user
    app.get("/All-user", verifyFBToken, async (req, res) => {
      const result = await usersCollection.find().toArray();
      const totaluser =await usersCollection.countDocuments()
      res.send({user :result, totaluser});
    });

    app.get("/user/role/:email", async (req, res) => {
      const email = req.params.email;
      const query = { email: email };
      const result = await usersCollection.findOne(query);
      res.send(result);
    });

    // add request api
    app.post("/request", verifyFBToken, async (req, res) => {
      const data = req.body;
      data.createAt = new Date();
      const result = await requestColocation.insertOne(data);
      res.send(result);
    });

    // status update blocked unblocked
    app.patch("/update/status", verifyFBToken, async (req, res) => {
      const { email, status } = req.query;
      const query = { email: email };
      const update = {
        $set: {
          status: status,
        },
      };
      const result = await usersCollection.updateOne(query, update);
      res.send(result);
    });

    // role update volunteer and admin 
    app.patch("/update/role",verifyFBToken,async(req,res)=>{
      const {email,role}=req.query;
      console.log(email,role);
      const query ={email:email}
      const update={
        $set:{
          role:role,
        },
      }
      const result =await usersCollection.updateOne(query,update)
      res.send(result)
    })

    // My request api
    app.get("/My-request", verifyFBToken, async (req, res) => {
      const email = req.decoded_email;
      const size = Number(req.query.size);
      const page = Number(req.query.page);
      const status =req.query.status;
      const query = { requesterEmail: email};

      if(status){
        query.status = status
      }

      const result = await requestColocation
        .find(query)
        .limit(size)
        .skip(size * page)
        .toArray();

      const totalRequest = await requestColocation.countDocuments(query);

      res.send({ request: result, totalRequest });
    });

    // profile api
    app.get("/user-profile", verifyFBToken, async (req, res) => {
      const email = req.query.email;
      const query = { email: email };
      const result = await usersCollection.findOne(query);
      res.send(result);
    });

    // profile update api
    app.patch("/update-profile", verifyFBToken, async (req, res) => {
      const { name, image, upazila, district, blood } = req.body;
      const email = req.decoded_email;
      const query = { email: email };
      const update = {
        $set: {
          name: name,
          image: image,
          upazila: upazila,
          district: district,
          blood: blood,
        },
      };
      const result = await usersCollection.updateOne(query, update);
      res.send(result);
    });

    // all request
    app.get("/All-request", verifyFBToken, async (req, res) => {
      const size = Number(req.query.size);
      const page = Number(req.query.page);
      const status =req.query.status;
      let query = {}
      if(status){
        query.status = status
      }
      const result = await requestColocation
        .find(query)
        .limit(size)
        .skip(size * page)
        .toArray();

      const totalRequest = await requestColocation.countDocuments();

      res.send({ request: result, totalRequest });
    });

    // delete request
    app.delete("/Delete-request", verifyFBToken, async (req, res) => {
      const id = req.query.id;
      const query = { _id: new ObjectId(id) };
      const result = await requestColocation.deleteOne(query);
      res.send(result);
    });

    // payment
    app.post("/create-payment-checkout", async (req, res) => {
      const information = req.body;
      const Amount = parseInt(information.donateAmount) * 100;
      
      const session = await stripe.checkout.sessions.create({
        line_items: [
          {
            price_data:{
              currency :"usd",
              unit_amount:Amount,
              product_data:{
                name:"please donate"
              }
            },
            quantity: 1,
          },
        ],
        mode: "payment",
        metadata:{
          donorName:information?.donorName
        },
        customer_email:information.donorEmail,
        success_url: `${process.env.SITE_DOMAIN}/payment-success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${process.env.SITE_DOMAIN}/payment-cancelled`
      });
      res.send({url:session.url})
    });

    app.post("/success-payment",async(req,res)=>{
      const {session_id}=req.query;
      const session =await stripe.checkout.sessions.retrieve(
        session_id
      );
      console.log(session);

      const transactionId =session.payment_intent;
      if(session.payment_status == "paid"){
        const paymentInfo ={
          amount:session.amount_total/100,
          currency:session.currency,
          donorEmail:session.customer_email,
          donorName:session.metadata.donorName,
          transactionId,
          payment_status:session.payment_status,
          paidAt : new Date()
        }
        console.log(paymentInfo);
        const result = await paymentColocation.insertOne(paymentInfo)
        return res.send(result)
      }
    })

    // payment table api 
    app.get("/payment-details",verifyFBToken,async(req,res)=>{
      const result = await paymentColocation.find().toArray()
      res.send(result);
    })

    // blood donation page pablic

    app.get("/donation-page",async(req,res)=>{
      const query ={status :"panding"}
      const result =await requestColocation.find(query).toArray()
      res.send(result)
    })

    // details api 
    app.get("/donation-details/:id",async(req,res)=>{
      const id =req.params.id;
      const query ={_id :new ObjectId(id)};
      const result=await requestColocation.findOne(query)
      res.send(result)
    })


    // donate
    app.patch("/donate",verifyFBToken,async(req,res)=>{
      const {status,id} =req.query;
      const query ={_id :new ObjectId(id)}
      const update={
        $set :{
          status :status
        }
      }
      const result = await requestColocation.updateOne(query,update)
      res.send(result)
    })


    // search request 
    app.get("/search-request",async(req,res)=>{
      const {bloodGroup,district,upazila}=req.query;
      console.log({bloodGroup,district,upazila})
      const query ={}
      if(!query){
        return;
      }
      if(bloodGroup){
        query.blood = bloodGroup.replace(/ /g, "+").trim()
      }
      if(district){
        query.district= district
      }
      if(upazila){
        query.upazila =upazila
      }
      const result = await requestColocation.find(query).toArray()
      res.send(result)
    })


    // cencel  api 
    app.patch("/cancel-request",verifyFBToken,async(req,res)=>{
      const {id,status}=req.query;
        console.log(id,status);
      const query ={_id :new ObjectId(id)}
    
      const update ={
        $set :{
          status :status
        }
      }
      const result =await requestColocation.updateOne(query,update)
      res.send(result)
    })

    // done api 
    app.patch("/done-request",verifyFBToken,async(req,res)=>{
      const {id,status}=req.query;
      const query ={_id :new ObjectId(id)}
      const update={
        $set:{
          status:status
        }
      }
      const result=await requestColocation.updateOne(query,update)
      res.send(result)
    })


    // view request 
    app.get("/Dashboard/view-request/:id",async(req,res)=>{
      const {id} = req.params;
      const query ={_id : new ObjectId(id)}
      const result = await requestColocation.findOne(query)
      res.send(result)
    })

    // donar dashboard api 
    app.get("/resent-request",verifyFBToken,async(req,res)=>{ 
      const result = await requestColocation.find().sort({createAt:-1}).limit(3).toArray()
       res.send(result) 
      })

      // edit
       app.get("/Dashboard/edit-request/:id",async(req,res)=>{
      const {id} = req.params;
      const query ={_id : new ObjectId(id)}
      const result = await requestColocation.findOne(query)
      res.send(result)
    })

    // Edit request api 
    app.put("/Dashboard/update-request/:id",async(req,res)=>{
      const {id}=req.params;
      const formdata=req.body;
      const query ={_id : new ObjectId(id)}
      const update ={
        $set: formdata  
      }
      const result =await requestColocation.updateOne(query,update);
      res.send(result)
    })



    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("project11 server is runnig");
});

app.listen(port, () => {
  console.log(`project11 server running on port ${port}`);
});

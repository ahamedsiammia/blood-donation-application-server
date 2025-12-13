const express = require('express');
const cors = require('cors');
const { MongoClient, ServerApiVersion } = require('mongodb');

require("dotenv").config()
const port = process.env.PORT || 3000

const app =express();
app.use(cors())
app.use(express.json())


const admin =require("firebase-admin")
const decoded = Buffer.from(process.env.FB_SERVICE_KEY, 'base64').toString('utf8')
const serviceAccount = JSON.parse(decoded);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});


const verifyFBToken =async(req,res,next)=>{
  const token =req.headers.authorization;

  if(!token){
    return res.status(401).send({message:"unauthoriz access"})
  }

  try{
    const idToken =token.split(' ')[1]
    const decoded =await admin.auth().verifyIdToken(idToken)
    console.log("decode info",decoded)
    req.decoded_email =decoded.email;
    next()
  }
  catch(error){
    return res.status(401).send({message:"unauthoriz access"})

  }
}




const uri = `mongodb+srv://${process.env.USER_NAME}:${process.env.USER_PASSWORD}.im5itev.mongodb.net/?appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();
    const db=client.db("project11")
    const usersCollection =db.collection("user")
    const requestColocation =db.collection("request")


    app.post("/user",async(req,res)=>{
        const userInfo =req.body
        userInfo.role ="donor"
        userInfo.createAt = new Date()
        const result = await usersCollection.insertOne(userInfo)
        res.send(result)
    })

app.post("/" ,async(req,res)=>{
  
})
    app.get("/user/role",async(req,res)=>{
        const email =req.query.email
        const query ={email:email}
        const result = await usersCollection.findOne(query)
        res.send(result)

    })

    // add request api
    app.post("/request",verifyFBToken,async(req,res)=>{
        const data =req.body;
        data.createAt =new Date();
        const result =await requestColocation.insertOne(data);
        res.send(result)
    })

    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);




app.get("/",(req,res)=>{
    res.send("project11 server is runnig")
})

app.listen(port,()=>{
    console.log(`project11 server running on port ${port}`)
})
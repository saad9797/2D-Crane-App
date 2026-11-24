Tech Stack :
I used node + prisma(ORM) for fast and scalable devlopment of backend,
used neon for deployment of database for keeping the data centralized from start - for demo one local instance is also created.
and used react + material UI for the frontend.
for the initial staging environment plan to deploy backend and frontend on render via docker-compose.yml file.
and i used jwt for safe auth with one token expiring after one day.

Engineering Desicions:
Took 5 user inputs : 
- Crane capacity: 10 tonnes
- Span: 20 metres
- Lifting height: 10 metres
- Crane type: Double girder
- Duty classification: A5
after taking these application creates technical drawing after estimating crane dimensions.


Currently cut to 3 views:
Plan view : crane view from above.
End view: crane view from side.
Front view: crane view from front.
and supports two configurations single and double girder.


User Experience:
supports 4 different formats (PDF, SVG, PNG, DXF) for user experience.
Also Revisions can be added on a diagram to keep record of all the states.
*-> this is estimation of dimensions all dimensions cannot be known correctly so they are esimated accordingly.
190 automated tests have been performed including engineering tests, API tests, and Frontend Tests.


What i would do if given more time :

I made 2 research documents:
Crane_AI_Addition_Research_Report.pdf:
Containing how we can integrate a open source ai model here and how can we make our work easy.
Crane_Drawing_Generation_Research_Report.pdf:
Containing the best work done uptill now on 2D diagrams taken from the internet and how can it be integrated here.


Strategy:

I ran 4 consecutive agents 2 doing the research required 1 checking the research done and implementing only rationally made choices through the 4th final agent.


Deplployment:
Handled the CORS error that ai did'nt did on its own and deployed the blueprint of both backend and frontend on render. with the database on neon.

Questions:
1. Who is the user, and what do they need?
Ans : User is a engineer who needs to see a visual of the crane and estimate dimensions to make better assumptions.
2. What did you assume (crane type, inputs, units, ranges), and why?
Ans : I assumed these 5 : 
- Crane capacity: 10 tonnes
- Span: 20 metres
- Lifting height: 10 metres
- Crane type: Double girder
- Duty classification: A5
because this was what i can think of from a developer's perspective the inputs required to make a customizable diagram.
3. Where did each formula or rule come from, and how sure are you?
Ans : They came from a research.
4. What did you leave out on purpose?
Ans : I did left out some more research to make the engineering results better.
5. What three questions would you ask our engineers?
Ans : How much load does the crane able to take,
How to estimate dimensions, and what are better formulas suited for this case.
6. What would you do with another week?
answer this breifly for me.
1) Customize it for the engineer needs making results accurate
2) work on the best user experience by implementing research done on 2D diagrams.
3) integrate opensource AI model to auto apply formulas.




A Full Stack Ready to use app on with CI/CD pipeline:

Frontend:

https://crane-web-3ni7.onrender.com

Backend:

https://crane-api-kz64.onrender.com

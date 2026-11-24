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
supports 4 different formats (PDF, SVG, PNG, DXF) for user experience.
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
